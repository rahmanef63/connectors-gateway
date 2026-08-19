/**
 * Pure parsing and URL building for the consent screen — docs/18-oauth.md.
 *
 * Split out from the page so the two things worth getting exactly right can be
 * tested without a browser: what an incoming authorization request is allowed
 * to look like, and how the browser is sent back to the client afterwards.
 */
import { normalizeMcpResourceUri, parseMcpScopeParameter } from "@cg/core"

/** Bounds every echoed parameter; `state` in particular is client-controlled. */
const MAX_PARAM_LENGTH = 2048

export type AuthorizationRequest = {
  clientId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: string
  /** RFC 8707 audience the eventual token is valid for. */
  resource: string
  scopes: string[]
  /** Opaque to us. Echoed back verbatim — it is the client's CSRF token. */
  state: string | null
}

function single(value: string | string[] | undefined): string | null {
  // A repeated parameter is refused rather than resolved. `?redirect_uri=good
  // &redirect_uri=evil` is a real technique, and picking either one guesses at
  // an intent the request does not express.
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_PARAM_LENGTH) return null
  return trimmed
}

/**
 * Returns null when the request is not one this server can act on at all.
 *
 * Nothing here decides whether the CLIENT is legitimate — that needs the
 * database, and it happens in `features/oauth`. This only rejects requests too
 * malformed to look up.
 */
export function parseAuthorizationRequest(
  params: Record<string, string | string[] | undefined>,
  expectedResource?: string | null,
): AuthorizationRequest | null {
  // OAuth 2.1 removed the implicit grant; `token` is not merely unsupported
  // here, it is a response type this server must never appear to offer.
  if (single(params.response_type) !== "code") return null

  const clientId = single(params.client_id)
  const redirectUri = single(params.redirect_uri)
  const codeChallenge = single(params.code_challenge)
  // Absent means `plain` under RFC 7636, which this server refuses. Defaulting
  // it to S256 would silently accept a downgraded request.
  const codeChallengeMethod = single(params.code_challenge_method) ?? "plain"

  if (clientId === null || redirectUri === null || codeChallenge === null) return null

  const resourceParam = single(params.resource)
  if (resourceParam === null && params.resource !== undefined) return null
  // Older clients omitted RFC 8707's parameter. When the trusted deployment
  // supplies the expected resource, bind them to that exact audience rather
  // than issuing an unbound token. Without an expected value, omission fails.
  const resource = normalizeMcpResourceUri(resourceParam ?? expectedResource)
  const expected =
    expectedResource === undefined || expectedResource === null
      ? null
      : normalizeMcpResourceUri(expectedResource)
  if (resource === null || (expected !== null && resource !== expected)) return null

  const scope = single(params.scope)
  if (scope === null && params.scope !== undefined) return null
  const scopes = parseMcpScopeParameter(scope)
  if (scopes === null) return null

  // `state` is optional, but PRESENT-AND-UNUSABLE is not the same as absent.
  // Dropping an over-long or repeated state would echo back a response with no
  // state at all, which an honest client must reject as a possible attack —
  // and it would do so with no way to tell that we mangled its CSRF token.
  const state = single(params.state)
  if (state === null && params.state !== undefined) return null

  return { clientId, redirectUri, codeChallenge, codeChallengeMethod, resource, scopes, state }
}

/**
 * Build the URL the browser is sent to once the user has decided.
 *
 * `redirectUri` MUST be the value the server validated against the client's
 * registered list, never the one straight off the query string — that check is
 * the only thing standing between this redirect and an attacker's host.
 *
 * Parameters are appended to whatever query the registered URI already carries
 * (RFC 6749 §3.1.2 permits one), and `state` is echoed on both the success and
 * the denial path: a client that cannot match the response to its request has
 * to treat it as an attack, so omitting it on denial breaks honest clients.
 * `iss` is appended on every response for RFC 9207 authorization-server mix-up
 * protection.
 */
export function buildRedirect(
  redirectUri: string,
  outcome: { code: string } | { error: "access_denied" | "server_error" },
  state: string | null,
  issuer: string,
): string {
  const url = new URL(redirectUri)
  if ("code" in outcome) {
    url.searchParams.set("code", outcome.code)
  } else {
    url.searchParams.set("error", outcome.error)
  }
  if (state !== null) url.searchParams.set("state", state)
  // RFC 9207 mix-up protection. The client must verify this is the issuer from
  // which it obtained the authorization endpoint before redeeming the code.
  url.searchParams.set("iss", issuer)
  return url.toString()
}
