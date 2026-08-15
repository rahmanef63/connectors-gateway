"use client"

import { useMemo } from "react"
import { usePaginatedQuery } from "convex/react"
import { Skeleton } from "@/components/skeleton"
import { auditFunctions } from "../config/functions"
import { DEFAULT_AUDIT_LABELS } from "../config/labels"
import { redactAuditRecords, selectAuditColumns } from "../lib/format"
import type { TimestampFormatOptions } from "../lib/format"
import { mergeLabels } from "../lib/labels"
import type { LabelOverride } from "../lib/labels"
import { useAuditFilters } from "../hooks/use-audit-filters"
import type { AuditColumn, AuditLabels } from "../types"
import { AuditEmptyState } from "./audit-empty-state"
import { AuditFilters } from "./audit-filters"
import { AuditTable } from "./audit-table"

export type AuditLogPanelProps = {
  labels?: LabelOverride<AuditLabels>
  /** Any name outside the audit allowlist is dropped (see lib/format). */
  columns?: readonly AuditColumn[]
  pageSize?: number
  dateFormat?: TimestampFormatOptions
}

const DEFAULT_PAGE_SIZE = 25

/** Deterministic on purpose — a random width would mismatch on hydration. */
const LOADING_ROW_WIDTHS = ["w-full", "w-11/12", "w-10/12", "w-9/12"] as const

/**
 * First-page shape: the `.card` surface the table lands on, so nothing below it
 * moves when the rows arrive. The whole drawing is decorative — `Skeleton` is
 * `aria-hidden` and this wrapper carries the announcement.
 *
 * The route's own `loading.tsx` uses the shared `TableSkeleton`; here the panel
 * heading is already painted, so a second header stand-in would be wrong.
 */
function AuditLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="card space-y-3 p-4">
      <Skeleton className="h-3.5 w-1/3" />
      {LOADING_ROW_WIDTHS.map((width) => (
        <Skeleton key={width} className={`h-4 ${width}`} />
      ))}
    </div>
  )
}

/** Paginated audit trail: who executed what, where, and how policy decided. */
export function AuditLogPanel({ labels, columns, pageSize, dateFormat }: AuditLogPanelProps) {
  const copy = useMemo(() => mergeLabels(DEFAULT_AUDIT_LABELS, labels), [labels])
  const visibleColumns = useMemo(() => selectAuditColumns(columns), [columns])
  const initialNumItems = pageSize !== undefined && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE

  const page = usePaginatedQuery(auditFunctions.listMine, {}, { initialNumItems })
  const rows = useMemo(() => redactAuditRecords(page.results), [page.results])
  const filters = useAuditFilters(rows)

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{copy.panelTitle}</h2>
        <p className="text-sm text-muted-foreground">{copy.panelDescription}</p>
      </header>

      <AuditFilters
        filters={filters.filters}
        connectors={filters.connectors}
        labels={copy}
        active={filters.active}
        onConnectorChange={filters.setConnectorId}
        onStatusChange={filters.setStatus}
        onReset={filters.reset}
      />

      {page.status === "LoadingFirstPage" ? (
        <AuditLoading label={copy.loading} />
      ) : rows.length === 0 ? (
        <AuditEmptyState title={copy.emptyTitle} description={copy.emptyDescription} />
      ) : filters.rows.length === 0 ? (
        <AuditEmptyState title={copy.filteredEmptyTitle} description={copy.filteredEmptyDescription} />
      ) : (
        <AuditTable
          rows={filters.rows}
          columns={visibleColumns}
          labels={copy}
          dateFormat={dateFormat}
        />
      )}

      {page.status === "CanLoadMore" || page.status === "LoadingMore" ? (
        <button
          type="button"
          className="btn-ghost disabled:opacity-50"
          onClick={() => page.loadMore(initialNumItems)}
          disabled={page.status === "LoadingMore"}
        >
          {page.status === "LoadingMore" ? copy.loadingMore : copy.loadMore}
        </button>
      ) : null}
    </section>
  )
}
