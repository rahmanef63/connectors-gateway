"use client"

import { useCallback, useMemo, useState } from "react"
import { applyAuditFilters, distinctConnectors, EMPTY_AUDIT_FILTERS, isFilterActive } from "../lib/filter"
import type { AuditFilterState, AuditRowView, AuditStatus } from "../types"

export type UseAuditFilters = {
  filters: AuditFilterState
  active: boolean
  connectors: string[]
  rows: AuditRowView[]
  setConnectorId: (connectorId: string) => void
  setStatus: (status: AuditStatus | "") => void
  reset: () => void
}

/** Filter state for the loaded page. Pure predicates live in `lib/filter`. */
export function useAuditFilters(rows: readonly AuditRowView[]): UseAuditFilters {
  const [filters, setFilters] = useState<AuditFilterState>(EMPTY_AUDIT_FILTERS)

  const setConnectorId = useCallback((connectorId: string) => {
    setFilters((current) => ({ ...current, connectorId }))
  }, [])

  const setStatus = useCallback((status: AuditStatus | "") => {
    setFilters((current) => ({ ...current, status }))
  }, [])

  const reset = useCallback(() => setFilters(EMPTY_AUDIT_FILTERS), [])

  const connectors = useMemo(() => distinctConnectors(rows), [rows])
  const filtered = useMemo(() => applyAuditFilters(rows, filters), [rows, filters])

  return {
    filters,
    active: isFilterActive(filters),
    connectors,
    rows: filtered,
    setConnectorId,
    setStatus,
    reset,
  }
}
