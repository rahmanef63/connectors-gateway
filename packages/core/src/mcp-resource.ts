/** RFC 8707 resource-indicator normalization for the MCP OAuth audience. */
const MAX_RESOURCE_URI_LENGTH = 2048
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

/**
 * Return one canonical HTTP(S) resource URI, or null for anything unsafe.
 * Production resources require HTTPS; plain HTTP is accepted only on loopback
 * so local OAuth tests and desktop development remain possible.
 */
export function normalizeMcpResourceUri(value: unknown): string | null {
  if (typeof value !== "string") return null
  const raw = value.trim()
  if (raw.length === 0 || raw.length > MAX_RESOURCE_URI_LENGTH) return null

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) return null
  if (url.username !== "" || url.password !== "") return null
  if (url.search !== "" || url.hash !== "") return null

  // URL canonicalizes scheme, host, default ports and dot segments. RFC 8707
  // treats a root resource without a trailing slash as the interoperable form.
  return url.pathname === "/" ? url.origin : `${url.origin}${url.pathname}`
}

export function isMcpResource(value: unknown, expected: string): value is string {
  const normalized = normalizeMcpResourceUri(value)
  const normalizedExpected = normalizeMcpResourceUri(expected)
  return normalized !== null && normalizedExpected !== null && normalized === normalizedExpected
}
