/**
 * This deployment's own public origin.
 *
 * Read from an env var and NOT from the request's Host header. A redirect URI
 * derived from a header the client controls is the classic way an authorization
 * code ends up delivered somewhere else — the authorization server would happily
 * send it wherever the request said, as long as the host passed its allowlist.
 */
const FALLBACK_DEV_ORIGIN = "http://localhost:3000"

export function appOrigin(): string {
  const raw = (process.env.APP_ORIGIN ?? "").trim().replace(/\/+$/, "")
  if (raw.length > 0) return raw
  if (process.env.NODE_ENV !== "production") return FALLBACK_DEV_ORIGIN
  throw new Error("APP_ORIGIN is not set")
}

/**
 * The single callback every connector redirects back to. One URL, not one per
 * connector: which connector a code belongs to is in the sealed flow state, and
 * an authorization server that pins a redirect URI at registration should only
 * ever have to be told this one.
 */
export function oauthRedirectUri(): string {
  return `${appOrigin()}/oauth/callback`
}
