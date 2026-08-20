import { asId, asRecord } from "./guards"

/** Shape-only validation at the wire boundary; cryptographic verification is agent-side. */
export function verifyKeyRotationShape(value: unknown): void {
  const record = asRecord(value, "The key rotation proof")
  asId(record.previousKeyId, "The previous signing key id")
  asId(record.nextKeyId, "The next signing key id")
  asId(record.nextPublicKey, "The next signing public key")
  asId(record.signature, "The key rotation signature")
}
