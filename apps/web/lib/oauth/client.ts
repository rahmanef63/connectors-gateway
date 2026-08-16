/**
 * The two POSTs of an authorization-code flow: registering a client when the
 * server offers it (RFC 7591), and redeeming the code for a token.
 *
 * No refresh handling yet. ponytail: the connectors in the catalog issue
 * long-lived tokens (CareerPack's are a year), so a refresh loop would be code
 * with nothing to exercise it. Add it when a connector returns `expires_in`
 * short enough to matter — the place to hang it is `refresh_token` from the
 * exchange below, which is currently read and dropped on purpose.
 */
import { DiscoveryError } from "./discovery"

const TIMEOUT_MS = 10_000
const MAX_BYTES = 32 * 1024

export class OAuthExchangeError extends Error {
  constructor(readonly code: string, description?: string) {
    super(description === undefined ? code : `${code}: ${description}`)
    this.name = "OAuthExchangeError"
  }
}

async function postJson(
  url: string,
  body: string,
  contentType: string,
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": contentType, accept: "application/json" },
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch {
    throw new OAuthExchangeError("network_error")
  }
  const text = (await response.text()).slice(0, MAX_BYTES)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new OAuthExchangeError("invalid_response")
  }
  const document = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {}
  if (!response.ok) {
    const error = typeof document["error"] === "string" ? document["error"] : `http_${response.status}`
    const description =
      typeof document["error_description"] === "string" ? document["error_description"] : undefined
    throw new OAuthExchangeError(error, description)
  }
  return document
}

export type RegisteredClient = { readonly clientId: string; readonly clientSecret: string | null }

/**
 * RFC 7591 open registration. This is what makes "click Connect" possible with
 * nothing typed: a server that offers it hands out a client id to anyone, and a
 * registration on its own grants no access — the user still has to consent.
 *
 * A server MAY return a secret. We keep it if so, because the token endpoint
 * will then demand it.
 */
export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
  clientName: string,
): Promise<RegisteredClient> {
  const document = await postJson(
    registrationEndpoint,
    JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    "application/json",
  )
  const clientId = document["client_id"]
  if (typeof clientId !== "string" || clientId.length === 0) {
    throw new OAuthExchangeError("registration_failed", "no client_id in response")
  }
  const secret = document["client_secret"]
  return { clientId, clientSecret: typeof secret === "string" && secret.length > 0 ? secret : null }
}

export type AuthorizeParams = {
  readonly authorizationEndpoint: string
  readonly clientId: string
  readonly redirectUri: string
  readonly challenge: string
  readonly state: string
  readonly scope: string | null
  readonly resource: string
}

/** The URL the browser is sent to. Nothing secret is in it — by design. */
export function authorizeUrl(params: AuthorizeParams): string {
  const url = new URL(params.authorizationEndpoint)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", params.clientId)
  url.searchParams.set("redirect_uri", params.redirectUri)
  url.searchParams.set("code_challenge", params.challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("state", params.state)
  // RFC 8707: bind the token to the one resource it may be spent against, so a
  // token minted for this connector cannot be replayed at another.
  url.searchParams.set("resource", params.resource)
  if (params.scope !== null) url.searchParams.set("scope", params.scope)
  return url.toString()
}

export type ExchangeParams = {
  readonly tokenEndpoint: string
  readonly code: string
  readonly redirectUri: string
  readonly clientId: string
  readonly clientSecret: string | null
  readonly verifier: string
  readonly resource: string
}

/** The access token, and the expiry the caller may want to record later. */
export type TokenResponse = { readonly accessToken: string; readonly expiresIn: number | null }

export async function exchangeCode(params: ExchangeParams): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    // Identical to the value sent to /authorize — the server compares them, and
    // a mismatch is how a code stolen from one callback is stopped at another.
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.verifier,
    resource: params.resource,
  })
  if (params.clientSecret !== null) body.set("client_secret", params.clientSecret)

  const document = await postJson(
    params.tokenEndpoint,
    body.toString(),
    "application/x-www-form-urlencoded",
  )
  const token = document["access_token"]
  if (typeof token !== "string" || token.length === 0) {
    throw new OAuthExchangeError("invalid_response", "no access_token")
  }
  const expires = document["expires_in"]
  return { accessToken: token, expiresIn: typeof expires === "number" ? expires : null }
}

export { DiscoveryError }
