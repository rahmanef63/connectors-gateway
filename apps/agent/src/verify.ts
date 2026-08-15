/**
 * Job envelope verification against the pinned gateway signing key.
 * Pinning policy and trust-on-first-use live in key-store.ts; this file only
 * turns a key into a verifier and compares two keys.
 */
import { importPublicKey, verifyJob } from "@cg/protocol"
import type { JobEnvelope, SignedJob } from "@cg/protocol"

export type JobVerifier = (signed: SignedJob) => Promise<JobEnvelope>

export type PinnedKey = {
  /** base64 SPKI Ed25519. */
  signingPublicKey: string
  keyId: string
}

export async function createJobVerifier(key: PinnedKey): Promise<JobVerifier> {
  const publicKey = await importPublicKey(key.signingPublicKey)
  const keyId = key.keyId
  return (signed: SignedJob) => verifyJob(signed, { publicKey, keyId })
}

/** True when `announced` is a different key than the one already pinned. */
export function isKeyRotation(pinned: PinnedKey, announced: PinnedKey): boolean {
  return announced.keyId !== pinned.keyId || announced.signingPublicKey !== pinned.signingPublicKey
}
