/**
 * Signed authorization for moving an already-pinned agent from one gateway
 * job-signing key to its successor without weakening TOFU.
 *
 * The proof is signed by the PREVIOUS private key. An agent accepts it only
 * when `previousKeyId` is the key it currently trusts and the announced next
 * key exactly matches the proof. Replaying an older proof therefore cannot
 * downgrade an agent that has already advanced past that key.
 */
import { GatewayError } from "@cg/core"
import { fromBase64Url, toBase64Url } from "./base64"
import { canonicalJson } from "./canonical"
import { asId, asRecord } from "./guards"

const ALGORITHM = { name: "Ed25519" } as const

export type KeyRotationStatement = {
  previousKeyId: string
  nextKeyId: string
  nextPublicKey: string
}

export type SignedKeyRotation = KeyRotationStatement & { signature: string }

export async function signKeyRotation(
  statement: KeyRotationStatement,
  previousPrivateKey: CryptoKey,
): Promise<SignedKeyRotation> {
  const normalized = parseStatement(statement)
  const signature = await crypto.subtle.sign(
    ALGORITHM,
    previousPrivateKey,
    new TextEncoder().encode(canonicalJson(normalized)),
  )
  return { ...normalized, signature: toBase64Url(signature) }
}

export async function verifyKeyRotation(
  proof: SignedKeyRotation,
  previousPublicKey: CryptoKey,
): Promise<KeyRotationStatement> {
  const record = asRecord(proof, "The key rotation proof")
  const statement = parseStatement(record)
  if (typeof record.signature !== "string") throw notAuthorized()
  let signature: Uint8Array
  try {
    signature = fromBase64Url(record.signature, "The key rotation signature")
  } catch {
    throw notAuthorized()
  }
  let valid = false
  try {
    valid = await crypto.subtle.verify(
      ALGORITHM,
      previousPublicKey,
      signature,
      new TextEncoder().encode(canonicalJson(statement)),
    )
  } catch {
    throw notAuthorized()
  }
  if (!valid) throw notAuthorized()
  return statement
}

function parseStatement(value: unknown): KeyRotationStatement {
  const record = asRecord(value, "The key rotation statement")
  return {
    previousKeyId: asId(record.previousKeyId, "The previous signing key id"),
    nextKeyId: asId(record.nextKeyId, "The next signing key id"),
    nextPublicKey: asId(record.nextPublicKey, "The next signing public key"),
  }
}

function notAuthorized(): GatewayError {
  return new GatewayError("NOT_AUTHORIZED", "The signing-key rotation proof is not valid.")
}
