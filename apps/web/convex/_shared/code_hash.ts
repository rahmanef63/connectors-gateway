/**
 * Hashing for the two short-lived OAuth secrets, kept in one file so the
 * authorize side and the exchange side cannot drift into different digests.
 *
 * Both are plain SHA-256, NOT PBKDF2, and that is correct here: an
 * authorization code is 256 bits of `crypto.getRandomValues` that lives for two
 * minutes and is deleted on first use. PBKDF2 defends a low-entropy secret
 * against offline guessing; there is nothing to guess, and the KDF cost would
 * land on every token exchange for no gain.
 */
import { toBase64Url, toHex } from "@cg/auth"

const encoder = new TextEncoder()

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))
}

/** Storage form of an authorization code. The code itself is never persisted. */
export async function hashAuthorizationCode(code: string): Promise<string> {
  return toHex(await digest(code))
}

/**
 * PKCE S256 (RFC 7636 §4.6): `BASE64URL(SHA256(ASCII(code_verifier)))`.
 * base64url, not hex — the challenge the client computed is base64url, and a
 * hex comparison would reject every honest client.
 */
export async function deriveCodeChallenge(codeVerifier: string): Promise<string> {
  return toBase64Url(await digest(codeVerifier))
}

/**
 * RFC 7636 §4.1: 43–128 characters from the unreserved set. Enforced so a
 * client cannot downgrade itself to a trivially guessable verifier and still
 * present a well-formed challenge.
 */
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/

export function isValidCodeVerifier(value: unknown): value is string {
  return typeof value === "string" && VERIFIER_RE.test(value)
}

/** A challenge is the base64url of a 32-byte digest: 43 chars, no padding. */
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/

export function isValidCodeChallenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE_RE.test(value)
}
