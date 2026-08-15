/**
 * Audit record shape — docs/10-observability.md.
 * Only identifiers and outcomes. Never payloads, tokens, or credentials.
 */
import type { ErrorCode } from "./errors"
import type { ExecutorKind, PolicyDecision } from "./risk"

export type AuditEvent = {
  requestId: string
  /** epoch ms */
  timestamp: number
  /** AI client / API key id that called. */
  actorId: string
  userId: string
  workspaceId?: string
  connectorId: string
  actionId: string
  executorKind: ExecutorKind
  deviceId?: string
  connectionId?: string
  policyDecision: PolicyDecision
  status: "success" | "error"
  latencyMs: number
  errorCode?: ErrorCode
}

export interface AuditSink {
  append(event: AuditEvent): Promise<void>
}
