/**
 * Ed25519 job signing and verification (docs/14: replayed job, stolen credential).
 *
 * The preimage is `canonicalJson(payload)` exactly as documented on `SignedJob`.
 * Verification order is deliberate: the SIGNATURE is checked first, so no claim
 * from an unauthenticated payload is ever acted on — not even to reject it.
 */
import { GatewayError } from "@cg/core"
import { fromBase64Url, toBase64Url } from "./base64"
import { canonicalJson } from "./canonical"
import { asRecord } from "./guards"
import { parseJobEnvelope } from "./job-guards"
import { PROTOCOL_VERSION, type JobEnvelope, type SignedJob } from "./types"

const ALGORITHM = { name: "Ed25519" } as const

/** Tolerated forward clock difference between gateway and agent. */
export const MAX_CLOCK_SKEW_MS = 60_000

export type SignJobOptions = {
  privateKey: CryptoKey
  keyId: string
}

export type VerifyJobOptions = {
  publicKey: CryptoKey
  keyId: string
  /** epoch ms; defaults to `Date.now()`. */
  now?: number
}

export async function signJob(payload: JobEnvelope, options: SignJobOptions): Promise<SignedJob> {
  const preimage = canonicalJson(payload)
  const signature = await crypto.subtle.sign(ALGORITHM, options.privateKey, encode(preimage))
  return { payload, signature: toBase64Url(signature), keyId: options.keyId }
}

export async function verifyJob(signed: SignedJob, options: VerifyJobOptions): Promise<JobEnvelope> {
  const record = asRecord(signed, "The signed job")
  const rawPayload = asRecord(record.payload, "The job envelope")

  // 1. Authenticate. Key id and signature failures are indistinguishable to a caller.
  if (typeof record.keyId !== "string" || record.keyId !== options.keyId) throw notAuthorized()
  if (typeof record.signature !== "string") throw notAuthorized()

  const signature = safeSignatureBytes(record.signature)
  const preimage = encode(canonicalJson(rawPayload))
  let valid = false
  try {
    valid = await crypto.subtle.verify(ALGORITHM, options.publicKey, signature, preimage)
  } catch {
    // Some runtimes throw instead of returning false for a malformed signature.
    throw notAuthorized()
  }
  if (!valid) throw notAuthorized()

  // 2. Only now are the claims trustworthy enough to read.
  const payload = parseJobEnvelope(rawPayload)
  if (payload.protocolVersion !== PROTOCOL_VERSION) {
    throw new GatewayError("INVALID_INPUT", "The job protocol version is not supported.")
  }

  const now = options.now ?? Date.now()
  if (now > payload.expiresAt) throw new GatewayError("TIMEOUT", "The job envelope has expired.")
  if (payload.issuedAt > now + MAX_CLOCK_SKEW_MS) {
    throw new GatewayError("TIMEOUT", "The job envelope was issued too far in the future.")
  }
  return payload
}

/** A malformed signature is an auth failure, not an input error — same response either way. */
function safeSignatureBytes(signature: string): Uint8Array {
  try {
    return fromBase64Url(signature, "The job signature")
  } catch {
    throw notAuthorized()
  }
}

function notAuthorized(): GatewayError {
  return new GatewayError("NOT_AUTHORIZED", "The job signature is not valid.")
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}
