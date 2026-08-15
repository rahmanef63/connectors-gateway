/**
 * Pairing codes arrive in `?code=` — an untrusted boundary (AGENTS rule P0).
 * Parse and normalise before the value is ever sent to Convex.
 * Alphabet and length mirror `pairingCode()` in @cg/core.
 */

export const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export const PAIRING_CODE_LENGTH = 8

const ALLOWED = new Set(PAIRING_CODE_ALPHABET)

/**
 * Returns the canonical code, or null if the input cannot be one.
 * Accepts user-friendly spacing/dashes and lowercase; rejects everything else.
 */
export function parsePairingCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  // Cheap guard so a megabyte-long query param never reaches the regex/loop.
  if (raw.length > 64) return null

  const normalized = raw.replace(/[\s-]/g, "").toUpperCase()
  if (normalized.length !== PAIRING_CODE_LENGTH) return null

  for (const character of normalized) {
    if (!ALLOWED.has(character)) return null
  }
  return normalized
}

/** Display form: `ABCD-EFGH`. Input must already be canonical. */
export function formatPairingCode(code: string): string {
  const half = Math.ceil(code.length / 2)
  return `${code.slice(0, half)}-${code.slice(half)}`
}
