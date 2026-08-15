/**
 * Upstream base URL validation — the SSRF gate.
 *
 * `baseUrl` is attacker-controlled: whatever a user stores on a connection is
 * later fetched by the GATEWAY process, from inside the deployment's network.
 * That makes this a server-side request forgery sink, so the value is validated
 * at the trust boundary (here) and stored normalised, never trusted later.
 *
 * WHAT THIS DOES NOT STOP — do not read this file as "SSRF is handled":
 *  - DNS rebinding. `evil.test` can answer 93.184.216.34 for this check and
 *    127.0.0.1 for the fetch a second later; nothing here sees the second
 *    answer.
 *  - A public hostname whose A/AAAA record simply points at a private address.
 *    We never resolve, so `internal.evil.test -> 10.0.0.5` passes.
 * ponytail: the real fix is resolve-then-pin at fetch time, in the gateway —
 * resolve the host once, reject the resolved address against the same tables
 * (`ip_literal.ts`), and connect to that pinned IP. This validator is a ceiling
 * on how bad the stored value can be, not a guarantee about where the socket
 * lands.
 */
import { fail } from "./errors"
import { blockedRange, isLoopback } from "./ip_literal"

const MAX_URL_LENGTH = 2048
/** 443 is https; 8443 is the conventional alternate for the same. */
const ALLOWED_PORTS: ReadonlySet<string> = new Set(["", "443", "8443"])

/**
 * Our own hosts. A connection pointing back at the deployment would let the
 * gateway be used as a confused deputy against its own control plane.
 * Env-driven so a fork or a rename does not need a code change; the defaults
 * are always kept (union, not replace) so setting the var cannot open a hole.
 */
const DEFAULT_SELF_HOSTS = [
  "api-connectors.rahmanef.com",
  "site-connectors.rahmanef.com",
  "dash-connectors.rahmanef.com",
  "connect.rahmanef.com",
] as const

/**
 * Validates and normalises an upstream base URL, or throws INVALID_INPUT.
 * Returns `origin + path` — no query, no fragment, no trailing slash, host
 * lower-cased, default port dropped — so two spellings of one endpoint cannot
 * become two connection rows.
 */
export function assertUpstreamUrl(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) {
    fail("INVALID_INPUT", "Base URL is missing or too long.")
  }
  const url = parseUrl(value.trim())
  if (url === null) fail("INVALID_INPUT", "Base URL is not a valid absolute URL.")

  // Credentials in the URL would be copied verbatim into an Authorization
  // header by most clients, and would sit in plaintext in the connection row.
  if (url.username !== "" || url.password !== "") {
    fail("INVALID_INPUT", "Base URL must not contain credentials.")
  }

  const host = canonicalHost(url)
  const devLoopback = loopbackAllowed() && isLoopback(host)

  if (url.protocol !== "https:" && !(url.protocol === "http:" && devLoopback)) {
    fail("INVALID_INPUT", "Base URL must use https.")
  }
  if (!devLoopback && (blockedRange(host) !== null || isLoopback(host))) {
    fail("INVALID_INPUT", "Base URL host is in a private or reserved address range.")
  }
  if (selfHosts().has(host)) {
    fail("INVALID_INPUT", "Base URL must not point back at this deployment.")
  }
  if (!devLoopback && !ALLOWED_PORTS.has(url.port)) {
    fail("INVALID_INPUT", "Base URL must use port 443 or 8443.")
  }
  return `${url.origin}${url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "")}`
}

/**
 * The hostname every check below runs against, with the DNS root label removed.
 *
 * `example.com.` and `example.com` resolve to the same machine, but they are
 * different STRINGS — and the WHATWG parser keeps the trailing dot on a name
 * (it only strips it from an IPv4 literal). So `localhost.` walked past
 * `isLoopback`, and `api-connectors.rahmanef.com.` walked past the self-host
 * set, while both still reached exactly the host those checks exist to forbid.
 * Stripped before any check runs, and written back onto the URL so the stored
 * value cannot become two spellings of one endpoint.
 */
function canonicalHost(url: URL): string {
  const host = url.hostname.toLowerCase()
  const stripped = host.replace(/\.+$/, "")
  if (stripped.length === 0) {
    fail("INVALID_INPUT", "Base URL is not a valid absolute URL.")
  }
  if (stripped !== host) url.hostname = stripped
  return stripped
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/** Default deny: http and odd ports only exist for local development. */
function loopbackAllowed(): boolean {
  const raw = process.env.ALLOW_LOOPBACK_UPSTREAM
  return raw === "1" || raw === "true"
}

function selfHosts(): ReadonlySet<string> {
  const hosts = new Set<string>(DEFAULT_SELF_HOSTS)
  // Entries are canonicalised the same way the input is, so an operator who
  // writes `internal.example.com.` still blocks `internal.example.com`.
  for (const entry of (process.env.UPSTREAM_BLOCKED_HOSTS ?? "").split(",")) {
    const host = entry.trim().toLowerCase().replace(/\.+$/, "")
    if (host.length > 0) hosts.add(host)
  }
  // Convex hands the deployment its own URLs; block whatever this one is.
  // A loopback value is skipped: on a dev machine CONVEX_SITE_URL is
  // 127.0.0.1:<port>, and this set matches on host alone, so keeping it would
  // block every other local port too. Loopback is governed by the dev flag.
  for (const key of ["CONVEX_CLOUD_URL", "CONVEX_SITE_URL"]) {
    const own = parseUrl(process.env[key] ?? "")
    const host = own === null ? "" : own.hostname.toLowerCase().replace(/\.+$/, "")
    if (host.length > 0 && !isLoopback(host)) hosts.add(host)
  }
  return hosts
}
