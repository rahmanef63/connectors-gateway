/**
 * Field validation for the connection form — the trust boundary on the way in.
 *
 * The control plane validates every one of these again and is the AUTHORITY:
 * `convex/_shared/upstream_url.ts` (the SSRF gate) and the sealed-envelope
 * check in `convex/features/connections/mutations.ts`. This file exists so the
 * user gets a sentence that names the actual problem — a server rejection can
 * only carry a code (`INVALID_INPUT` covers a bad connector id, a private host,
 * a wrong port and a raw token alike) and its message is never rendered, so
 * "that host is not reachable from the gateway" can only be said here.
 *
 * It is deliberately no STRICTER than the server: a rule here that the control
 * plane does not have would refuse a connection the product actually allows.
 * The IP tables are imported from the control plane's own module rather than
 * restated, so the two cannot drift.
 */
import { blockedRange, isLoopback } from "@convex/_shared/ip_literal"

export type FieldIssue =
  | "connector_empty"
  | "connector_shape"
  | "url_empty"
  | "url_invalid"
  | "url_scheme"
  | "url_credentials"
  | "url_unreachable"
  | "url_port"
  | "url_self"
  | "token_empty"
  | "token_not_sealed"

export type FieldResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly issue: FieldIssue }

const ok = (value: string): FieldResult => ({ ok: true, value })
const bad = (issue: FieldIssue): FieldResult => ({ ok: false, issue })

/** Mirrors `convex/_shared/input.ts` IDENTIFIER_PATTERN + MAX_IDENTIFIER_LENGTH. */
const CONNECTOR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const MAX_CONNECTOR_LENGTH = 128

export function validateConnectorId(raw: string): FieldResult {
  const value = raw.trim()
  if (value.length === 0) return bad("connector_empty")
  if (value.length > MAX_CONNECTOR_LENGTH || !CONNECTOR_PATTERN.test(value)) {
    return bad("connector_shape")
  }
  return ok(value)
}

/** Mirrors `upstream_url.ts` — 443 is https, 8443 the conventional alternate. */
const ALLOWED_PORTS: ReadonlySet<string> = new Set(["", "443", "8443"])
const MAX_URL_LENGTH = 2048

export type BaseUrlOptions = {
  /**
   * Hosts belonging to this deployment. The control plane refuses a connection
   * pointing back at itself (confused deputy), and its list is env-driven, so
   * the browser passes what it knows: its own Convex and gateway origins.
   */
  selfHosts?: readonly string[]
}

/**
 * Canonical origin + path. Query and fragment are dropped: a base URL is a
 * prefix the adapter appends to, and a stray `?token=` there would be a
 * credential sitting in a field that is not encrypted.
 */
export function validateBaseUrl(raw: string, options: BaseUrlOptions = {}): FieldResult {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return bad("url_empty")
  if (trimmed.length > MAX_URL_LENGTH) return bad("url_invalid")

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return bad("url_invalid")
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return bad("url_invalid")
  if (url.username !== "" || url.password !== "") return bad("url_credentials")

  // The DNS root label, dropped exactly as `assertUpstreamUrl` drops it —
  // `localhost.` reaches localhost but matches no name-based rule below. Kept
  // in step with the server so this form neither passes something the control
  // plane will reject nor previews a URL different from the one it stores.
  const host = url.hostname.toLowerCase().replace(/\.+$/, "")
  if (host.length === 0) return bad("url_invalid")
  if (host !== url.hostname) url.hostname = host
  // Loopback, private, link-local and cloud-metadata addresses: the gateway
  // calls this from a server, where those point at the gateway's own network
  // or at nothing at all.
  if (isLoopback(host) || blockedRange(host) !== null) return bad("url_unreachable")
  // Plain http would put the upstream token on the wire in clear.
  if (url.protocol !== "https:") return bad("url_scheme")
  if (selfHostSet(options.selfHosts).has(host)) return bad("url_self")
  if (!ALLOWED_PORTS.has(url.port)) return bad("url_port")

  return ok(`${url.origin}${url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "")}`)
}

function selfHostSet(hosts: readonly string[] | undefined): ReadonlySet<string> {
  const set = new Set<string>()
  for (const host of hosts ?? []) {
    const trimmed = host.trim().toLowerCase()
    if (trimmed.length > 0) set.add(trimmed)
  }
  return set
}

/**
 * The sealed envelope `packages/auth` produces: `v1.<iv>.<ciphertext>`, both
 * halves base64url. Character-for-character the control plane's own
 * `SEALED_PATTERN`; 12 IV bytes encode to exactly 16 characters, and the
 * shortest genuine ciphertext (one plaintext byte plus a 16-byte GCM tag) is 23.
 *
 * This is the check that stops the worst outcome on this screen: a RAW token
 * pasted here stores a credential the gateway can never open, and every call
 * through it fails much later, far from the mistake.
 */
const SEALED_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/
const MAX_TOKEN_CIPHER_LENGTH = 8192

export function validateSealedToken(raw: string): FieldResult {
  const value = raw.trim()
  if (value.length === 0) return bad("token_empty")
  if (value.length > MAX_TOKEN_CIPHER_LENGTH || !SEALED_PATTERN.test(value)) {
    return bad("token_not_sealed")
  }
  return ok(value)
}

export type ConnectionFormInput = {
  connectorId: string
  baseUrl: string
  tokenCipher: string
}

export type ConnectionFormResult =
  | { readonly ok: true; readonly value: ConnectionFormInput }
  | { readonly ok: false; readonly field: keyof ConnectionFormInput; readonly issue: FieldIssue }

/** First failure wins, in reading order, so the message points at one field. */
export function validateConnectionForm(
  input: ConnectionFormInput,
  options: BaseUrlOptions = {},
): ConnectionFormResult {
  const connector = validateConnectorId(input.connectorId)
  if (!connector.ok) return { ok: false, field: "connectorId", issue: connector.issue }
  const baseUrl = validateBaseUrl(input.baseUrl, options)
  if (!baseUrl.ok) return { ok: false, field: "baseUrl", issue: baseUrl.issue }
  const token = validateSealedToken(input.tokenCipher)
  if (!token.ok) return { ok: false, field: "tokenCipher", issue: token.issue }

  return {
    ok: true,
    value: {
      connectorId: connector.value,
      baseUrl: baseUrl.value,
      tokenCipher: token.value,
    },
  }
}
