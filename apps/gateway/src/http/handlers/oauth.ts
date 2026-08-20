/**
 * The machine half of the OAuth authorization server — docs/18-oauth.md.
 *
 * `POST /oauth/register` (RFC 7591) and `POST /oauth/token` (RFC 6749 §4.1.3).
 * Neither needs a human, so both live here rather than on the dashboard; the
 * consent screen, which does, is the dashboard's `/oauth/authorize`.
 *
 * These endpoints do NOT use the gateway's own error envelope. OAuth defines
 * its own — `{"error": "...", "error_description": "..."}` with a specific set
 * of codes — and a client library parses that shape and no other. A gateway
 * `{"error":{"code":"INVALID_INPUT"}}` here reads to a client as a malformed
 * response, not as a rejected grant.
 */
import {
  REDIRECT_URI_MESSAGE,
  isValidRedirectUri,
  normalizeMcpResourceUri,
  normalizeOAuthApplicationType,
  toGatewayError,
} from "@cg/core"
import { readFormBody, readJsonBody } from "../body"
import type { RouteContext } from "../routes"
import { mcpResourceUrl } from "./well-known"

const MAX_FIELD_LENGTH = 2048
const MAX_CLIENT_NAME_LENGTH = 100
const MAX_REDIRECT_URIS = 5

const HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  // RFC 6749 §5.1: a token response must never be cached, anywhere.
  "cache-control": "no-store",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
})

function oauthJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS })
}

/** RFC 6749 §5.2 error codes are a closed set; anything else confuses clients. */
type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  /** RFC 8707 resource indicator is absent or names another audience. */
  | "invalid_target"
  | "unauthorized_client"
  | "unsupported_grant_type"
  /** RFC 7591 §3.2.2, registration only. */
  | "invalid_redirect_uri"
  | "server_error"

function oauthError(code: OAuthErrorCode, description: string, status = 400): Response {
  return oauthJson({ error: code, error_description: description }, status)
}

function field(fields: Record<string, unknown>, name: string): string | null {
  const value = fields[name]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_FIELD_LENGTH) return null
  return trimmed
}

/**
 * RFC 7591 §3.1 — dynamic client registration.
 *
 * Unauthenticated on purpose: an AI host has no way to obtain a client id
 * otherwise, because neither claude.ai nor ChatGPT offers a field to paste one
 * into. Registering grants nothing — see the note on `service/oauth`.
 */
export async function handleOAuthRegister(context: RouteContext): Promise<Response> {
  if (!await context.deps.oauthLimiter.check(context.clientKey)) {
    return oauthError("invalid_request", "Too many registration attempts.", 429)
  }

  let body: Record<string, unknown>
  try {
    // RFC 7591 specifies JSON here, unlike the token endpoint's form encoding.
    body = await readJsonBody(context.request)
  } catch {
    return oauthError("invalid_request", "The registration request must be JSON.")
  }

  const rawUris = body.redirect_uris
  if (!Array.isArray(rawUris) || rawUris.length === 0 || rawUris.length > MAX_REDIRECT_URIS) {
    return oauthError("invalid_request", "One to five redirect_uris are required.")
  }
  const redirectUris = rawUris.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.length > 0 && entry.length <= MAX_FIELD_LENGTH,
  )
  if (redirectUris.length !== rawUris.length) {
    return oauthError("invalid_request", "Every redirect_uri must be a string.")
  }
  // Checked HERE as well as on the write path, because `ControlPlaneClient`
  // flattens every control-plane failure into one opaque `UPSTREAM_ERROR` — so
  // without this, a client that sent a bad URI got a 500 it could not act on,
  // and the `INVALID_INPUT` branch below was unreachable. Convex re-checks it;
  // that remains the check that counts.
  if (!redirectUris.every(isValidRedirectUri)) {
    return oauthError("invalid_redirect_uri", REDIRECT_URI_MESSAGE)
  }

  const clientName =
    field(body, "client_name")?.slice(0, MAX_CLIENT_NAME_LENGTH) ?? "Unnamed client"
  const applicationType = normalizeOAuthApplicationType(
    body.application_type === undefined ? "web" : body.application_type,
  )
  if (applicationType === null) {
    return oauthError("invalid_request", "application_type must be web or native.")
  }

  try {
    const client = await context.deps.oauth.registerClient({
      clientName,
      redirectUris,
      applicationType,
      issuer: context.deps.config.publicUrl,
    })
    return oauthJson(
      {
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        application_type: client.applicationType,
        client_id_issued_at: Math.floor(client.createdAt / 1000),
        // No `client_secret`, and its absence is the contract: these are public
        // clients and PKCE is what binds a code to its requester. The two
        // fields below say so in the machine-readable way a client expects.
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
      },
      201,
    )
  } catch (cause) {
    const error = toGatewayError(cause)
    if (error.code === "INVALID_INPUT") {
      // The control plane rejected a URI. Say so — this one IS the client's
      // fault and is fixable by sending a different value.
      return oauthError("invalid_request", error.message)
    }
    context.scope.logger.error("client registration failed", { code: error.code })
    return oauthError("server_error", "Could not register the client.", 500)
  }
}

/**
 * RFC 6749 §4.1.3 — authorization code exchange, PKCE required.
 *
 * Every rejection answers `invalid_grant` with one message. Distinguishing
 * "unknown code" from "wrong verifier" from "wrong client" would let a holder
 * of a stolen code learn which parameter to change.
 */
export async function handleOAuthToken(context: RouteContext): Promise<Response> {
  if (!await context.deps.oauthLimiter.check(context.clientKey)) {
    return oauthError("invalid_request", "Too many token requests.", 429)
  }

  let fields: Record<string, string>
  try {
    fields = await readFormBody(context.request)
  } catch {
    return oauthError("invalid_request", "The token request must be form-encoded.")
  }

  const grantType = field(fields, "grant_type")
  if (grantType !== "authorization_code") {
    // Named separately from invalid_grant: this one is a client configuration
    // error, and the client can act on knowing which grant types exist.
    return oauthError("unsupported_grant_type", "Only authorization_code is supported.")
  }

  const code = field(fields, "code")
  const codeVerifier = field(fields, "code_verifier")
  const clientId = field(fields, "client_id")
  const redirectUri = field(fields, "redirect_uri")
  const rawResource = field(fields, "resource")
  if (rawResource === null && fields.resource !== undefined) {
    return oauthError("invalid_target", "The resource indicator is malformed.")
  }
  const expectedResource = mcpResourceUrl(context.deps.config)
  // Legacy clients omitted `resource`; bind them to this endpoint rather than
  // minting an unbound token. Any explicit value must match exactly.
  const resource = normalizeMcpResourceUri(rawResource ?? expectedResource)
  if (resource !== expectedResource) {
    return oauthError("invalid_target", "This authorization server cannot issue for that resource.")
  }

  if (code === null || clientId === null || redirectUri === null) {
    return oauthError("invalid_request", "code, client_id and redirect_uri are required.")
  }
  if (codeVerifier === null) {
    // PKCE is mandatory here, so a missing verifier is a malformed request
    // rather than a failed one — there is no non-PKCE path to fall back to.
    return oauthError("invalid_request", "code_verifier is required (PKCE S256).")
  }

  try {
    const issued = await context.deps.oauth.redeemCode({
      code,
      codeVerifier,
      clientId,
      redirectUri,
      resource,
      issuer: context.deps.config.publicUrl,
    })
    return oauthJson(
      {
        access_token: issued.accessToken,
        token_type: "Bearer",
        expires_in: issued.expiresIn,
        scope: issued.scopes.join(" "),
        // No refresh_token, deliberately: this server issues none, and an
        // absent field is how a client learns to re-run the flow instead of
        // waiting for a refresh that never comes.
      },
      200,
    )
  } catch (cause) {
    const error = toGatewayError(cause)
    if (error.code === "NOT_AUTHORIZED" || error.code === "INVALID_INPUT") {
      return oauthError("invalid_grant", "The authorization grant is invalid or expired.")
    }
    context.scope.logger.error("token exchange failed", { code: error.code })
    return oauthError("server_error", "Could not complete the token exchange.", 500)
  }
}
