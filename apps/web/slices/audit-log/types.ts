/**
 * View types for the `audit-log` slice.
 * The domain record is `AuditEvent` from @cg/core; nothing here redefines it.
 */
import type { AuditEvent, AuditExecutorKind, PolicyDecision } from "@cg/core"

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

/**
 * Semantic tone, re-pointed at the app's tone SSOT (`@/components/status-badge`).
 *
 * The slice names a tone; it never names a colour. Because the union is the
 * app's own, a tone this slice invents does not compile, and a tone the design
 * system retires breaks the build here instead of rendering untoned.
 */
export type { Tone } from "@/components/status-badge"

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
  executor: Record<AuditExecutorKind, string>
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
