/**
 * View types for the `audit-log` slice.
 * The domain record is `AuditEvent` from @cg/core; nothing here redefines it.
 */
import type { AuditEvent, ExecutorKind, PolicyDecision } from "@cg/core"

/**
 * The ONLY fields this slice is allowed to render (docs/10).
 * `Pick` below fails to compile if a name is not an `AuditEvent` field, and the
 * runtime allowlist in `lib/format.ts` is typed against this union — together
 * they stop the audit view from turning into a payload viewer.
 */
export type AuditColumn =
  | "requestId"
  | "timestamp"
  | "actorId"
  | "userId"
  | "workspaceId"
  | "connectorId"
  | "actionId"
  | "executorKind"
  | "deviceId"
  | "connectionId"
  | "policyDecision"
  | "status"
  | "latencyMs"
  | "errorCode"

/**
 * `rowId` is a list key, deliberately NOT an `AuditColumn`: it is carried so
 * React can key the table and is never rendered as a cell.
 */
export type AuditRowView = Pick<AuditEvent, AuditColumn> & { rowId: string }

export type AuditStatus = AuditRowView["status"]

/** Semantic tone, independent of any design-system variant vocabulary. */
export type Tone = "positive" | "neutral" | "muted" | "warning" | "danger"

/** Variant vocabulary of the consumer's badge primitive. */
export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "outline"

/** Client-side filter state, applied over the loaded page only. */
export type AuditFilterState = {
  /** Connector id, or `""` for every connector. */
  connectorId: string
  /** Execution status, or `""` for every status. */
  status: AuditStatus | ""
}

/** Copy contract. Every user-visible string in the slice comes from here. */
export type AuditLabels = {
  panelTitle: string
  panelDescription: string
  loading: string
  loadMore: string
  loadingMore: string
  emptyTitle: string
  emptyDescription: string
  filteredEmptyTitle: string
  filteredEmptyDescription: string
  columns: Record<AuditColumn, string>
  decision: Record<PolicyDecision, string>
  executor: Record<ExecutorKind, string>
  status: Record<AuditStatus, string>
  filters: {
    connectorLabel: string
    connectorAll: string
    statusLabel: string
    statusAll: string
    reset: string
  }
  latency: {
    milliseconds: string
    seconds: string
  }
  /** Rendered where a value is absent or unreadable. */
  emptyCell: string
}
