/**
 * Redirect URI validation — the highest-consequence check in the whole OAuth
 * surface.
 *
 * The authorization code is delivered BY THE BROWSER to whatever URI this
 * function admits. Accept one attacker-controlled URI at registration and the
 * flow hands that attacker a code for whichever user later approves the
 * consent screen; PKCE limits what they can do with it, but nothing else here
 * stands between a loose check and account access.
 *
 * So: an allowlist by construction. Registration stores exact strings, the
 * authorize step compares byte-for-byte against them, and neither end does
 * prefix, subdomain or wildcard matching — every one of those has a published
 * bypass.
 */
import { fail } from "./errors"

const MAX_URI_LENGTH = 512

/** http is allowed ONLY here: a native client that listens on a random port. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

/**
 * Schemes an installed application registers with the OS. Permitted because a
 * desktop MCP client has no web origin to redirect to — but the URI still has
 * to be an exact stored string, so a custom scheme is no weaker than https.
 */
function isPrivateUseScheme(scheme: string): boolean {
  // RFC 8252 §7.1: a private-use scheme should be a reverse-DNS name the app
  // controls. Requiring a dot keeps `javascript:` and friends out.
  return /^[a-z][a-z0-9+.-]*$/.test(scheme) && scheme.includes(".")
}

export function isValidRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URI_LENGTH) {
    return false
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  // RFC 6749 §3.1.2: the endpoint URI must not include a fragment. A fragment
  // never reaches the server, so it cannot be compared, and appending one is a
  // classic way to make two different URIs compare equal.
  if (url.hash.length > 0) return false

  // Round-trip check. `URL` normalises, and a stored string that does not equal
  // its own parse can never match at authorize time — better to refuse it at
  // registration than to mint a client that can never complete a flow.
  if (url.href !== value) return false

  const scheme = url.protocol.slice(0, -1).toLowerCase()
  if (scheme === "https") return url.hostname.length > 0
  if (scheme === "http") return LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
  return isPrivateUseScheme(scheme)
}

export function assertRedirectUri(value: unknown): string {
  if (!isValidRedirectUri(value)) {
    fail("INVALID_INPUT", "A redirect URI must be https, http on loopback, or an app scheme.")
  }
  return value
}

/**
 * Exact membership. Not `startsWith`, not a host comparison: a registered
 * `https://claude.ai/callback` must not authorize a redirect to
 * `https://claude.ai/callback/../../evil` or `https://claude.ai.evil.test/`.
 */
export function isRegisteredRedirectUri(
  candidate: string,
  registered: readonly string[],
): boolean {
  return registered.includes(candidate)
}
