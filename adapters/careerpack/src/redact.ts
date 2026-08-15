/**
 * Message redaction for anything that came back from CareerPack.
 *
 * Invariant 5 (AGENTS.md): connector credentials never appear in tool output — and by
 * extension never in an error message or a log line. Upstream servers habitually echo
 * the offending Authorization header back in 401 bodies, so every upstream string is
 * scrubbed before it is allowed into a GatewayError.
 */

/** Errors returned to an AI client stay short; long bodies are never useful to it. */
export const MAX_MESSAGE_LENGTH = 200

const REDACTED = "[redacted]"

/** Shortest secret we will still strip literally; below this, false positives dominate. */
const MIN_LITERAL_SECRET = 4

const TOKEN_PATTERNS: RegExp[] = [
  // `Authorization: Bearer <token>` and friends.
  /bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  // `token=...`, `"api_key": "..."`, `secret: ...`
  /\b(?:access[_-]?token|refresh[_-]?token|token|secret|api[_-]?key|apikey|password|authorization)\b\s*["':=]+\s*["']?[A-Za-z0-9._~+/=-]+["']?/gi,
  // JWT-shaped triples.
  /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  // Any long opaque run — catches sk_live_..., hex digests, base64url blobs.
  /\b[A-Za-z0-9_-]{24,}\b/g,
]

/**
 * Strip the known credential plus anything token-shaped, then cap the length.
 * The literal pass runs first so the exact secret is removed even if no pattern matches.
 */
export function redact(text: string, secret: string): string {
  let out = text
  if (secret.length >= MIN_LITERAL_SECRET) {
    out = out.split(secret).join(REDACTED)
  }
  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, REDACTED)
  }
  out = out.replace(/\s+/g, " ").trim()
  return out.length > MAX_MESSAGE_LENGTH ? out.slice(0, MAX_MESSAGE_LENGTH) : out
}
