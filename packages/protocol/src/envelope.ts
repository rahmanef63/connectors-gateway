/**
 * Job envelope construction (docs/05-local-agent-protocol.md).
 * The caller supplies `connector`, `action` and `input`; identity in
 * `requestContext` is attached server-side and must never come from an AI client.
 */
import { newId } from "@cg/core"
import { asId, asRecord, asOptionalId, invalid } from "./guards"
import { DEFAULT_JOB_TTL_MS, PROTOCOL_VERSION, type JobEnvelope } from "./types"

/** Upper bound on the replay/expiry window a single job may claim. */
export const MAX_JOB_TTL_MS = 300_000

export type CreateJobEnvelopeInput = {
  connector: string
  action: string
  input: unknown
  requestContext: JobEnvelope["requestContext"]
  ttlMs?: number
  /** epoch ms; defaults to `Date.now()`. */
  now?: number
}

export function createJobEnvelope(input: CreateJobEnvelopeInput): JobEnvelope {
  const connector = asId(input.connector, "The connector id")
  const action = asId(input.action, "The action id")
  const context = asRecord(input.requestContext, "The request context")
  const requestId = asId(context.requestId, "The request id")
  const userId = asId(context.userId, "The user id")
  const workspaceId = asOptionalId(context.workspaceId, "The workspace id")

  const ttlMs = input.ttlMs ?? DEFAULT_JOB_TTL_MS
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MAX_JOB_TTL_MS) {
    throw invalid("The job ttl must be between 1 and 300000 ms.")
  }
  const issuedAt = input.now ?? Date.now()
  if (!Number.isFinite(issuedAt) || issuedAt < 0) throw invalid("The job issue time is not valid.")

  return {
    id: newId("job"),
    protocolVersion: PROTOCOL_VERSION,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
    connector,
    action,
    input: input.input,
    requestContext: workspaceId === undefined ? { requestId, userId } : { requestId, userId, workspaceId },
    nonce: newId("nonce"),
  }
}
