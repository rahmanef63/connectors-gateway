/**
 * Audit wire shapes — docs/10-observability.md. Identifiers and outcomes only:
 * there is no field here that can hold a payload, a token, or a local path,
 * because a field that can hold one eventually will.
 */
import { type Infer, v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import {
  auditStatusValidator,
  errorCodeValidator,
  executorKindValidator,
  policyDecisionValidator,
} from "./validators"

export const auditEventValidator = v.object({
  requestId: v.string(),
  timestamp: v.number(),
  actorId: v.string(),
  userId: v.string(),
  workspaceId: v.optional(v.string()),
  connectorId: v.string(),
  actionId: v.string(),
  executorKind: executorKindValidator,
  deviceId: v.optional(v.string()),
  connectionId: v.optional(v.string()),
  policyDecision: policyDecisionValidator,
  status: auditStatusValidator,
  latencyMs: v.number(),
  errorCode: v.optional(errorCodeValidator),
})

/** Same fields plus the row id, for keying a list in the dashboard. */
export const auditRowValidator = v.object({
  ...auditEventValidator.fields,
  rowId: v.string(),
})

export type AuditRow = Infer<typeof auditRowValidator>

export function toAuditRow(doc: Doc<"auditLogs">): AuditRow {
  return {
    rowId: doc._id,
    requestId: doc.requestId,
    timestamp: doc.timestamp,
    actorId: doc.actorId,
    userId: doc.userId,
    ...(doc.workspaceId === undefined ? {} : { workspaceId: doc.workspaceId }),
    connectorId: doc.connectorId,
    actionId: doc.actionId,
    executorKind: doc.executorKind,
    ...(doc.deviceId === undefined ? {} : { deviceId: doc.deviceId }),
    ...(doc.connectionId === undefined ? {} : { connectionId: doc.connectionId }),
    policyDecision: doc.policyDecision,
    status: doc.status,
    latencyMs: doc.latencyMs,
    ...(doc.errorCode === undefined ? {} : { errorCode: doc.errorCode }),
  }
}
