/**
 * The plaintext inside a connection's sealed `renewalCipher`.
 *
 * This is deliberately one encrypted document rather than several database
 * fields: Convex coordinates refresh leases but never receives a refresh token
 * or client secret it can read. The same parser is used by the dashboard before
 * sealing and by the gateway after opening, so the two sides cannot silently
 * drift on the wire shape.
 */
const MAX_DOCUMENT_LENGTH = 32 * 1024
const MAX_ENDPOINT_LENGTH = 2_048
const MAX_IDENTIFIER_LENGTH = 2_048
const MAX_SECRET_LENGTH = 16 * 1024
const MAX_SCOPE_LENGTH = 4_096

/** Start renewal early enough that one network retry does not spend an expired token. */
export const OAUTH_REFRESH_SKEW_MS = 60_000
/** A crashed gateway may own a cross-instance refresh lease only this long. */
export const OAUTH_REFRESH_LEASE_MS = 20_000

export type RefreshTokenRenewal = {
  readonly v: 1
  readonly grantType: "refresh_token"
  readonly tokenEndpoint: string
  readonly clientId: string
  readonly clientSecret: string | null
  readonly refreshToken: string
  readonly scope: string | null
  readonly resource: string
}

export type ClientCredentialsRenewal = {
  readonly v: 1
  readonly grantType: "client_credentials"
  readonly tokenEndpoint: string
  readonly clientId: string
  readonly clientSecret: string
  readonly scope: string | null
  readonly resource: string
}

export type OAuthRenewal = RefreshTokenRenewal | ClientCredentialsRenewal

/** Canonical JSON for sealing. Throws one opaque error and never echoes a secret. */
export function encodeOAuthRenewal(value: OAuthRenewal): string {
  const json = JSON.stringify(value)
  const parsed = parseOAuthRenewal(json)
  if (parsed === null) throw new Error("OAuth renewal metadata is invalid.")
  return JSON.stringify(parsed)
}

/** Parse decrypted renewal metadata. Any malformed/oversized value is absent. */
export function parseOAuthRenewal(json: string): OAuthRenewal | null {
  if (typeof json !== "string" || json.length === 0 || json.length > MAX_DOCUMENT_LENGTH) return null

  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return null
  }
  if (!record(value) || value.v !== 1) return null

  const tokenEndpoint = required(value.tokenEndpoint, MAX_ENDPOINT_LENGTH)
  const clientId = required(value.clientId, MAX_IDENTIFIER_LENGTH)
  const resource = required(value.resource, MAX_ENDPOINT_LENGTH)
  const scope = optional(value.scope, MAX_SCOPE_LENGTH)
  if (tokenEndpoint === null || clientId === null || resource === null || scope === undefined) {
    return null
  }

  if (value.grantType === "refresh_token") {
    const refreshToken = required(value.refreshToken, MAX_SECRET_LENGTH)
    const clientSecret = optional(value.clientSecret, MAX_SECRET_LENGTH)
    if (refreshToken === null || clientSecret === undefined) return null
    return {
      v: 1,
      grantType: "refresh_token",
      tokenEndpoint,
      clientId,
      clientSecret,
      refreshToken,
      scope,
      resource,
    }
  }

  if (value.grantType === "client_credentials") {
    const clientSecret = required(value.clientSecret, MAX_SECRET_LENGTH)
    if (clientSecret === null) return null
    return {
      v: 1,
      grantType: "client_credentials",
      tokenEndpoint,
      clientId,
      clientSecret,
      scope,
      resource,
    }
  }
  return null
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function required(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null
}

/** `undefined` means invalid; `null` is a valid explicit absence. */
function optional(value: unknown, max: number): string | null | undefined {
  if (value === null) return null
  return required(value, max) ?? undefined
}
