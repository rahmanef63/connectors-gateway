/**
 * Secret hashing for API keys and device credentials.
 * PBKDF2-SHA256 via WebCrypto (docs/03-security-model.md): identical code path
 * in Bun, Node 22 and the Convex runtime.
 */
import { GatewayError } from "@cg/core"
import { fromBase64Url, toBase64Url } from "./base64url"

export const PBKDF2_ITERATIONS = 210_000
const SALT_BYTES = 16
const KEY_BYTES = 32
/** Bounds on a *stored* value, so a tampered record cannot force a CPU burn. */
const MIN_ITERATIONS = 1_000
const MAX_ITERATIONS = 1_000_000

const encoder = new TextEncoder()

type ParsedHash = { iterations: number; salt: Uint8Array; hash: Uint8Array }

async function deriveBits(
  secret: string,
  salt: Uint8Array,
  iterations: number,
  keyBytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, [
    "deriveBits",
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    keyBytes * 8,
  )
  return new Uint8Array(bits)
}

/** `pbkdf2$sha256$<iterations>$<saltB64url>$<hashB64url>` */
export async function hashSecret(secret: string): Promise<string> {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new GatewayError("INVALID_INPUT", "A credential secret is required.")
  }
  const salt = new Uint8Array(SALT_BYTES)
  crypto.getRandomValues(salt)
  const hash = await deriveBits(secret, salt, PBKDF2_ITERATIONS, KEY_BYTES)
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`
}

/** Strict parse. A malformed stored value yields null — never a throw that would reveal its shape. */
function parseStored(stored: string): ParsedHash | null {
  if (typeof stored !== "string") return null
  const parts = stored.split("$")
  if (parts.length !== 5) return null
  const [algorithm, digest, rawIterations, rawSalt, rawHash] = parts
  if (algorithm !== "pbkdf2" || digest !== "sha256") return null
  if (rawIterations === undefined || !/^[0-9]{1,9}$/.test(rawIterations)) return null
  const iterations = Number(rawIterations)
  if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return null
  const salt = rawSalt === undefined ? null : fromBase64Url(rawSalt)
  const hash = rawHash === undefined ? null : fromBase64Url(rawHash)
  if (!salt || !hash) return null
  // Exact lengths: a truncated hash must not verify against a truncated derivation.
  if (salt.length !== SALT_BYTES || hash.length !== KEY_BYTES) return null
  return { iterations, salt, hash }
}

/**
 * Constant-time comparison: no early return, no `===` on strings.
 * A length mismatch is folded into the accumulator rather than short-circuiting.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0xff) ^ (b[i] ?? 0x00)
  }
  return diff === 0
}

/**
 * Returns false for a wrong secret AND for a malformed stored value.
 * Note the malformed branch skips the KDF; callers that must not leak
 * "this record exists" verify against `dummyStoredHash()` instead.
 */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  if (typeof secret !== "string" || secret.length === 0) return false
  const parsed = parseStored(stored)
  if (!parsed) return false
  const candidate = await deriveBits(secret, parsed.salt, parsed.iterations, parsed.hash.length)
  return timingSafeEqual(candidate, parsed.hash)
}

let dummy: Promise<string> | null = null

/**
 * A real hash over a per-process throwaway value. Verifying against it costs the
 * same as verifying a real record, so "unknown key" and "wrong secret" take the
 * same time (docs/14-threat-model.md). Never written to disk — no secret in a file.
 */
export function dummyStoredHash(): Promise<string> {
  if (!dummy) {
    const filler = new Uint8Array(32)
    crypto.getRandomValues(filler)
    dummy = hashSecret(toBase64Url(filler))
  }
  return dummy
}
