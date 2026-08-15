/**
 * AES-256-GCM sealing for connection credentials at rest (docs/03, docs/14).
 * The key comes from `CREDENTIAL_ENCRYPTION_KEY` (base64, 32 bytes).
 * Every failure — bad key, bad format, failed tag check — surfaces as one
 * opaque INTERNAL error: a crypto message would be an oracle.
 */
import { GatewayError } from "@cg/core"
import { fromBase64Url, toBase64Url } from "./base64url"

const VERSION = "v1"
const IV_BYTES = 12
const KEY_BYTES = 32
const TAG_BYTES = 16
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function unavailable(): GatewayError {
  return new GatewayError("INTERNAL", "Credential unavailable.")
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = typeof keyB64 === "string" ? fromBase64Url(keyB64) : null
  if (!raw || raw.length !== KEY_BYTES) throw unavailable()
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])
}

/** `v1.<ivB64url>.<cipherB64url>` with a fresh random IV per call. */
export async function seal(plaintext: string, keyB64: string): Promise<string> {
  if (typeof plaintext !== "string") throw unavailable()
  const key = await importKey(keyB64)
  const iv = new Uint8Array(IV_BYTES)
  crypto.getRandomValues(iv)
  try {
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plaintext),
    )
    return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`
  } catch {
    throw unavailable()
  }
}

export async function open(sealed: string, keyB64: string): Promise<string> {
  if (typeof sealed !== "string") throw unavailable()
  const parts = sealed.split(".")
  if (parts.length !== 3 || parts[0] !== VERSION) throw unavailable()
  const iv = parts[1] === undefined ? null : fromBase64Url(parts[1])
  const cipher = parts[2] === undefined ? null : fromBase64Url(parts[2])
  // GCM output is ciphertext + 16-byte tag, so anything shorter is malformed.
  if (!iv || iv.length !== IV_BYTES || !cipher || cipher.length < TAG_BYTES) throw unavailable()
  const key = await importKey(keyB64)
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher)
    return decoder.decode(plain)
  } catch {
    throw unavailable()
  }
}

// ponytail: no associated data bound to the ciphertext yet. Upgrade path — pass
// the connection id as AES-GCM `additionalData` so a sealed blob cannot be
// replayed onto a different connection row; needs a v2 tag and a re-seal pass.
