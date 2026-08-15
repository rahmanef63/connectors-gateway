/**
 * Audit assembly for the execution pipeline (docs/10).
 *
 * Ids reaching this module may be caller-supplied (an unknown connector still
 * gets an audit row), so they are truncated and control-stripped: an audit
 * store must not become a dumping ground for unbounded model output.
 */
import type {
  AuditEvent,
  AuditSink,
  ErrorCode,
  ExecutorKind,
  PolicyDecision,
  Principal,
} from "@cg/core"
import { buildAuditEvent } from "@cg/observability"

const MAX_ID_LENGTH = 128
/** Control characters would corrupt a JSON log line. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

export function safeId(value: string): string {
  return value.replace(CONTROL_CHARS, "").slice(0, MAX_ID_LENGTH)
}

export type AuditInput = {
  requestId: string
  principal: Principal
  connectorId: string
  actionId: string
  executorKind: ExecutorKind
  policyDecision: PolicyDecision
  status: "success" | "error"
  latencyMs: number
  errorCode?: ErrorCode
  deviceId?: string
  connectionId?: string
}

export function toAuditEvent(input: AuditInput): AuditEvent {
  return buildAuditEvent({
    requestId: input.requestId,
    actorId: input.principal.callerId,
    userId: input.principal.userId,
    connectorId: safeId(input.connectorId),
    actionId: safeId(input.actionId),
    executorKind: input.executorKind,
    policyDecision: input.policyDecision,
    status: input.status,
    latencyMs: input.latencyMs,
    ...(input.principal.workspaceId !== undefined
      ? { workspaceId: input.principal.workspaceId }
      : {}),
    ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
    ...(input.deviceId !== undefined ? { deviceId: input.deviceId } : {}),
    ...(input.connectionId !== undefined ? { connectionId: input.connectionId } : {}),
  })
}

export async function appendAudit(sink: AuditSink, input: AuditInput): Promise<void> {
  await sink.append(toAuditEvent(input))
}
