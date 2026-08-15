/**
 * Runtime shape guards for job envelopes. A signed job arrives over an
 * untrusted socket, so every field is checked before it is read.
 */
import type { JobEnvelope, SignedJob } from "./types"
import { asFiniteNumber, asId, asOptionalId, asRecord, invalid } from "./guards"

/**
 * Validates in place and returns the ORIGINAL object. The signature covers the
 * payload exactly as it arrived; rebuilding a normalized copy could change the
 * canonical preimage and break verification for a forward-compatible signer.
 */
export function parseJobEnvelope(value: unknown): JobEnvelope {
  const record = asRecord(value, "The job envelope")
  asId(record.id, "The job id")
  asId(record.protocolVersion, "The job protocol version")
  asId(record.connector, "The job connector")
  asId(record.action, "The job action")
  asId(record.nonce, "The job nonce")

  const issuedAt = asFiniteNumber(record.issuedAt, "The job issuedAt")
  const expiresAt = asFiniteNumber(record.expiresAt, "The job expiresAt")
  if (issuedAt < 0 || expiresAt < 0) throw invalid("Job timestamps must not be negative.")
  if (expiresAt <= issuedAt) throw invalid("The job expiry must be after its issue time.")

  const context = asRecord(record.requestContext, "The job request context")
  asId(context.requestId, "The job request id")
  asId(context.userId, "The job user id")
  asOptionalId(context.workspaceId, "The job workspace id")

  return value as JobEnvelope
}

export function parseSignedJob(value: unknown): SignedJob {
  const record = asRecord(value, "The signed job")
  asId(record.keyId, "The signing key id")
  asId(record.signature, "The job signature")
  parseJobEnvelope(record.payload)
  return value as SignedJob
}
