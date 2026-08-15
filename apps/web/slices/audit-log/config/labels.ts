/**
 * Default copy for the `audit-log` slice. A consumer overrides any subset of it
 * through the `labels` prop — that is what makes the slice portable.
 */
import type { AuditLabels } from "../types"

export const DEFAULT_AUDIT_LABELS: AuditLabels = {
  panelTitle: "Audit log",
  panelDescription: "Who executed what, where it ran, and how policy decided it.",
  loading: "Loading audit events…",
  loadMore: "Load more",
  loadingMore: "Loading…",
  emptyTitle: "No audit events yet",
  emptyDescription: "Every executed action is recorded here with its policy decision.",
  filteredEmptyTitle: "No events match these filters",
  filteredEmptyDescription: "Clear the filters to see the whole loaded page.",
  columns: {
    requestId: "Request",
    timestamp: "Time",
    actorId: "Actor",
    userId: "User",
    workspaceId: "Workspace",
    connectorId: "Connector",
    actionId: "Action",
    executorKind: "Executor",
    deviceId: "Device",
    connectionId: "Connection",
    policyDecision: "Decision",
    status: "Status",
    latencyMs: "Latency",
    errorCode: "Error",
  },
  decision: {
    ALLOW: "Allowed",
    DENY: "Denied",
    REQUIRE_APPROVAL: "Approval required",
  },
  executor: {
    cloud: "Cloud",
    local: "Local",
  },
  status: {
    success: "Success",
    error: "Error",
  },
  filters: {
    connectorLabel: "Connector",
    connectorAll: "All connectors",
    statusLabel: "Status",
    statusAll: "All statuses",
    reset: "Clear filters",
  },
  latency: {
    milliseconds: "ms",
    seconds: "s",
  },
  emptyCell: "—",
}
