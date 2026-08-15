import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { TimestampFormatOptions } from "../lib/format"
import type { AuditColumn, AuditLabels, AuditRowView } from "../types"
import { AuditRow } from "./audit-row"

export type AuditTableProps = {
  rows: readonly AuditRowView[]
  columns: readonly AuditColumn[]
  labels: AuditLabels
  dateFormat?: TimestampFormatOptions
}

/** Wide content scrolls inside its own container, never the page. */
export function AuditTable({ rows, columns, labels, dateFormat }: AuditTableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column}>{labels.columns[column]}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <AuditRow
              key={row.rowId}
              row={row}
              columns={columns}
              labels={labels}
              dateFormat={dateFormat}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
