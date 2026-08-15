"use client"

import { Button } from "@/components/ui/button"
import { AUDIT_STATUSES } from "../lib/format"
import { readMember } from "../lib/guards"
import type { AuditFilterState, AuditLabels, AuditStatus } from "../types"

export type AuditFiltersProps = {
  filters: AuditFilterState
  /** Connector ids present in the loaded page. */
  connectors: readonly string[]
  labels: AuditLabels
  active: boolean
  onConnectorChange: (connectorId: string) => void
  onStatusChange: (status: AuditStatus | "") => void
  onReset: () => void
}

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

/**
 * Filters the loaded page only.
 *
 * ponytail: native `<select>` rather than a design-system Select — no select
 * primitive is a declared dependency, and a native control is accessible by
 * default. Swap the two elements when one lands.
 */
export function AuditFilters({
  filters,
  connectors,
  labels,
  active,
  onConnectorChange,
  onStatusChange,
  onReset,
}: AuditFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {labels.filters.connectorLabel}
        <select
          className={SELECT_CLASS}
          value={filters.connectorId}
          onChange={(event) => onConnectorChange(event.target.value)}
        >
          <option value="">{labels.filters.connectorAll}</option>
          {connectors.map((connectorId) => (
            <option key={connectorId} value={connectorId}>
              {connectorId}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {labels.filters.statusLabel}
        <select
          className={SELECT_CLASS}
          value={filters.status}
          onChange={(event) => onStatusChange(readMember(event.target.value, AUDIT_STATUSES) ?? "")}
        >
          <option value="">{labels.filters.statusAll}</option>
          {AUDIT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {labels.status[status]}
            </option>
          ))}
        </select>
      </label>

      {active ? (
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          {labels.filters.reset}
        </Button>
      ) : null}
    </div>
  )
}
