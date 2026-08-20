/** HMAC authentication for gateway-to-gateway relay traffic. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export const PEER_AUTH_WINDOW_MS = 30_000
const SIGNATURE = /^[a-f0-9]{64}$/
const NONCE = /^[A-Za-z0-9_-]{16,96}$/

export type PeerAuthHeaders = {
  timestamp: string
  nonce: string
  signature: string
}

export function signPeerRequest(secret: string, body: string, now = Date.now()): PeerAuthHeaders {
  const timestamp = String(now)
  const nonce = randomBytes(18).toString("base64url")
  return { timestamp, nonce, signature: signatureFor(secret, timestamp, nonce, body) }
}

export function verifyPeerRequest(
  secret: string,
  body: string,
  headers: { timestamp: string | null; nonce: string | null; signature: string | null },
  now = Date.now(),
): boolean {
  const { timestamp, nonce, signature } = headers
  if (timestamp === null || nonce === null || signature === null) return false
  if (!/^\d{10,16}$/.test(timestamp) || !NONCE.test(nonce) || !SIGNATURE.test(signature)) return false
  const issuedAt = Number(timestamp)
  if (!Number.isSafeInteger(issuedAt) || Math.abs(now - issuedAt) > PEER_AUTH_WINDOW_MS) return false
  const expected = signatureFor(secret, timestamp, nonce, body)
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"))
}

function signatureFor(secret: string, timestamp: string, nonce: string, body: string): string {
  return createHmac("sha256", secret)
    .update("POST\n/internal/relay/dispatch\n")
    .update(timestamp)
    .update("\n")
    .update(nonce)
    .update("\n")
    .update(body)
    .digest("hex")
}
