/** Prefixed, collision-free ids. Uses the platform WebCrypto — no dependency. */

const PREFIXES = {
  request: "req",
  job: "job",
  device: "dev",
  pairing: "pair",
  connection: "conn",
  audit: "aud",
  nonce: "nce",
} as const

export type IdKind = keyof typeof PREFIXES

export function newId(kind: IdKind): string {
  return `${PREFIXES[kind]}_${crypto.randomUUID().replaceAll("-", "")}`
}

/** URL-safe random string for pairing codes and secrets. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return btoa(String.fromCharCode(...buf)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

/** Short, human-typable pairing code. Excludes look-alike characters. */
export function pairingCode(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  return Array.from(buf, (byte) => alphabet[byte % alphabet.length]).join("")
}
