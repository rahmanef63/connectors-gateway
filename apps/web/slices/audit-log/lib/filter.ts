/**
 * Client-side filtering over the rows already loaded by the paginated query.
 * Deliberately not a server filter: paging plus server-side predicates is a
 * different query shape, and the MVP audit view is small.
 *
 * ponytail: when a workspace outgrows a few pages, move `connectorId`/`status`
 * into `features/audit/queries:listMine` args and delete this module.
 */
import type { AuditFilterState, AuditRowView } from "../types"

export const EMPTY_AUDIT_FILTERS: AuditFilterState = Object.freeze({ connectorId: "", status: "" })

export function isFilterActive(filters: AuditFilterState): boolean {
  return filters.connectorId !== "" || filters.status !== ""
}

/** Connector ids present in the loaded rows, for the filter options. */
export function distinctConnectors(rows: readonly AuditRowView[]): string[] {
  const seen = new Set<string>()
  for (const row of rows) seen.add(row.connectorId)
  return [...seen].sort()
}

export function applyAuditFilters(
  rows: readonly AuditRowView[],
  filters: AuditFilterState,
): AuditRowView[] {
  return rows.filter((row) => {
    if (filters.connectorId !== "" && row.connectorId !== filters.connectorId) return false
    if (filters.status !== "" && row.status !== filters.status) return false
    return true
  })
}
