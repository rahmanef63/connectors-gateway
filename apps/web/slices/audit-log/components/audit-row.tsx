import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableRow } from "@/components/ui/table"
import { badgeVariantForStatus } from "../config/tone"
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
    <Badge variant={badgeVariantForStatus(row.status)}>{labels.status[row.status]}</Badge>
  ),
}

function textCell(value: string | number | undefined, fallback: string): string {
  if (typeof value === "number") return String(value)
  return value === undefined || value.length === 0 ? fallback : value
}

/** One audit event. Only allowlisted columns reach this component. */
export function AuditRow({ row, columns, labels, dateFormat }: AuditRowProps) {
  return (
    <TableRow>
      {columns.map((column) => {
        const renderer = CELL_RENDERERS[column]
        return (
          <TableCell key={column} className="align-top text-sm">
            {renderer === undefined
              ? textCell(row[column], labels.emptyCell)
              : renderer({ row, labels, dateFormat })}
          </TableCell>
        )
      })}
    </TableRow>
  )
}
