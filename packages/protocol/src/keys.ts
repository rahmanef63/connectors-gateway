/**
 * Ed25519 job-signing keys.
 *
 * WebCrypto `Ed25519` is used directly: verified working on bun 1.3.14 and
 * Node 22 (the agent runtime), so the node:crypto fallback would be dead code.
 * ponytail: one algorithm, no negotiation — rotation is `keyId` + a new pair.
 */
import { GatewayError } from "@cg/core"
import { fromBase64, toBase64 } from "./base64"

const ALGORITHM = { name: "Ed25519" } as const

// The runtime's own WebCrypto types; `KeyUsage`/`BufferSource` are DOM-only globals
// and this package compiles with `lib: ES2023`.
type KeyData = Parameters<SubtleCrypto["importKey"]>[1]
type KeyUsages = Parameters<SubtleCrypto["importKey"]>[4]

export type SigningKeyPair = {
  /** base64 PKCS#8. Secret: never log it, never return it to a client. */
  privateKey: string
  /** base64 SPKI. Safe to publish — the agent receives it in `welcome`. */
  publicKey: string
}

export async function generateSigningKeyPair(): Promise<SigningKeyPair> {
  const pair = (await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"])) as CryptoKeyPair
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.exportKey("pkcs8", pair.privateKey),
    crypto.subtle.exportKey("spki", pair.publicKey),
  ])
  return { privateKey: toBase64(privateKey), publicKey: toBase64(publicKey) }
}

/** `b64` is a trust boundary (env var / config). Errors never echo the material. */
export async function importPrivateKey(b64: string): Promise<CryptoKey> {
  const bytes = fromBase64(requireString(b64, "signing private key"), "The signing private key")
  return importOrFail("pkcs8", bytes, ["sign"], "private", false)
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const bytes = fromBase64(requireString(b64, "signing public key"), "The signing public key")
  return importOrFail("spki", bytes, ["verify"], "public", true)
}

async function importOrFail(
  format: "pkcs8" | "spki",
  bytes: Uint8Array,
  usages: KeyUsages,
  kind: "private" | "public",
  extractable: boolean,
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(format, bytes as KeyData, ALGORITHM, extractable, usages)
  } catch {
    throw new GatewayError("INVALID_INPUT", `The signing ${kind} key is not a valid Ed25519 key.`)
  }
}

function requireString(value: string, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new GatewayError("INVALID_INPUT", `The ${what} is missing.`)
  }
  return value
}
