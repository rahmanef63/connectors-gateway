import type { ReactNode } from "react"
import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/cn"
import { columnCellClass } from "../config/columns"
import { toneForStatus } from "../config/tone"
import { formatLatency, formatTimestamp } from "../lib/format"
import type { TimestampFormatOptions } from "../lib/format"
import type { AuditColumn, AuditLabels, AuditRowView } from "../types"
import { DecisionBadge } from "./decision-badge"
import { ExecutorBadge } from "./executor-badge"

export type AuditRowProps = {
  row: AuditRowView
  /** Already filtered through the column allowlist by the panel. */
  columns: readonly AuditColumn[]
  labels: AuditLabels
  dateFormat?: TimestampFormatOptions
}

type CellContext = {
  row: AuditRowView
  labels: AuditLabels
  dateFormat: TimestampFormatOptions | undefined
}

/** Columns needing more than text. Everything else falls through to `textCell`. */
const CELL_RENDERERS: Partial<Record<AuditColumn, (context: CellContext) => ReactNode>> = {
  timestamp: ({ row, labels, dateFormat }) => formatTimestamp(row.timestamp, labels.emptyCell, dateFormat),
  latencyMs: ({ row, labels }) => formatLatency(row.latencyMs, labels.latency, labels.emptyCell),
  policyDecision: ({ row, labels }) => (
    <DecisionBadge decision={row.policyDecision} label={labels.decision[row.policyDecision]} />
  ),
  executorKind: ({ row, labels }) => (
    <ExecutorBadge executor={row.executorKind} label={labels.executor[row.executorKind]} />
  ),
  status: ({ row, labels }) => (
    <StatusBadge tone={toneForStatus(row.status)}>{labels.status[row.status]}</StatusBadge>
  ),
}

function textCell(value: string | number | undefined, fallback: string): string {
  if (typeof value === "number") return String(value)
  return value === undefined || value.length === 0 ? fallback : value
}

/**
 * One audit event as a native `<tr>`. Only allowlisted columns reach this
 * component, and the per-column class comes from config/columns.ts — there is
 * no inline branch on a column or a decision here.
 */
export function AuditRow({ row, columns, labels, dateFormat }: AuditRowProps) {
  return (
    <tr className="border-b border-border last:border-b-0">
      {columns.map((column) => {
        const renderer = CELL_RENDERERS[column]
        return (
          <td key={column} className={cn("px-4 py-3.5 align-top", columnCellClass(column))}>
            {renderer === undefined
              ? textCell(row[column], labels.emptyCell)
              : renderer({ row, labels, dateFormat })}
          </td>
        )
      })}
    </tr>
  )
}
