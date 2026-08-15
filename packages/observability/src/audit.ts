/**
 * Audit records — docs/10-observability.md.
 * Identifiers and outcomes only. Inputs, outputs, files, tokens and
 * credentials are structurally impossible here: `buildAuditEvent` copies the
 * declared fields one by one instead of spreading its argument.
 */
import type { AuditEvent, AuditSink } from "@cg/core"
import type { Logger } from "./logger"

/** Everything `AuditEvent` declares; `timestamp` defaults to now. */
export type AuditEventInput = Omit<AuditEvent, "timestamp"> & { timestamp?: number }

export function buildAuditEvent(input: AuditEventInput): AuditEvent {
  const event: AuditEvent = {
    requestId: input.requestId,
    timestamp: input.timestamp ?? Date.now(),
    actorId: input.actorId,
    userId: input.userId,
    connectorId: input.connectorId,
    actionId: input.actionId,
    executorKind: input.executorKind,
    policyDecision: input.policyDecision,
    status: input.status,
    latencyMs: input.latencyMs,
  }
  if (input.workspaceId !== undefined) event.workspaceId = input.workspaceId
  if (input.deviceId !== undefined) event.deviceId = input.deviceId
  if (input.connectionId !== undefined) event.connectionId = input.connectionId
  if (input.errorCode !== undefined) event.errorCode = input.errorCode
  return event
}

/**
 * The MVP sink: audit records go to the structured log stream.
 * ponytail: durable storage (Convex `audit_events`) replaces this behind the
 * same AuditSink port — no caller changes.
 */
export function createLoggingAuditSink(logger: Logger): AuditSink {
  return {
    async append(event: AuditEvent): Promise<void> {
      // Rebuilt, not forwarded: a caller that widened AuditEvent cannot smuggle
      // a payload field into the log through this sink.
      logger.info("audit", { ...buildAuditEvent(event), kind: "audit" })
    },
  }
}
