"use client"

import { useId } from "react"
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

/**
 * Filters the loaded page only.
 *
 * Native `<select>` on the app's `.field` class, each with a real `<label
 * htmlFor>` — both filters choose from a closed vocabulary (the connector ids
 * in the page, and the two audit statuses), so a free-text `<input>` would only
 * let a reader type a value that filters everything out. `useId` keeps the
 * pairing unique when a consumer mounts the panel twice.
 *
 * ponytail: no design-system Select primitive exists in this app, and a native
 * control is accessible and keyboard-operable by default. Swap the elements if
 * one ever lands; the props do not change.
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
  const fieldId = useId()
  const connectorFieldId = `${fieldId}-connector`
  const statusFieldId = `${fieldId}-status`

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={connectorFieldId} className="text-xs font-medium text-muted-foreground">
          {labels.filters.connectorLabel}
        </label>
        <select
          id={connectorFieldId}
          className="field w-52 max-w-full"
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
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={statusFieldId} className="text-xs font-medium text-muted-foreground">
          {labels.filters.statusLabel}
        </label>
        <select
          id={statusFieldId}
          className="field w-40 max-w-full"
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
      </div>

      {active ? (
        <button type="button" className="btn-ghost" onClick={onReset}>
          {labels.filters.reset}
        </button>
      ) : null}
    </div>
  )
}
