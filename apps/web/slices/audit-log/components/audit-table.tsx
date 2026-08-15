import type { TimestampFormatOptions } from "../lib/format"
import type { AuditColumn, AuditLabels, AuditRowView } from "../types"
import { AuditRow } from "./audit-row"

export type AuditTableProps = {
  rows: readonly AuditRowView[]
  columns: readonly AuditColumn[]
  labels: AuditLabels
  dateFormat?: TimestampFormatOptions
}

/**
 * The audit trail as a native `<table>` on the app's `.card` surface — the same
 * shell `components/table-skeleton.tsx` draws while the page loads, so the
 * arriving data changes the text and nothing else.
 *
 * Wide content scrolls INSIDE the card: the cells are `whitespace-nowrap`, and
 * `overflow-x-auto` on the card bounds them at the container. The page body
 * never scrolls sideways however many columns a consumer asks for.
 */
export function AuditTable({ rows, columns, labels, dateFormat }: AuditTableProps) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        {/* A real caption, hidden visually because the panel heading above
            already says it — a screen reader still gets the table named. */}
        <caption className="sr-only">{labels.panelTitle}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {labels.columns[column]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <AuditRow
              key={row.rowId}
              row={row}
              columns={columns}
              labels={labels}
              dateFormat={dateFormat}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
