/**
 * Column → cell presentation, as a lookup table so the row renderer never
 * branches on a column name inline.
 *
 * Layout and typography only. There is deliberately no status colour in this
 * file: colour reaches a cell through `<StatusBadge>` and the app tone map
 * alone (see config/tone.ts), which is what stops the audit table inventing a
 * second green.
 */
import type { AuditColumn } from "../types"

/** Opaque identifiers read as data, not prose: mono, dimmed, never wrapped. */
const IDENTIFIER = "whitespace-nowrap font-mono text-xs text-muted-foreground"

export const COLUMN_CELL_CLASSES: Readonly<Partial<Record<AuditColumn, string>>> = Object.freeze({
  requestId: IDENTIFIER,
  actorId: IDENTIFIER,
  userId: IDENTIFIER,
  workspaceId: IDENTIFIER,
  deviceId: IDENTIFIER,
  connectionId: IDENTIFIER,
  // The two columns a reader scans down the table, so they stay legible.
  actionId: "whitespace-nowrap font-mono text-xs",
  connectorId: "whitespace-nowrap font-medium",
  timestamp: "whitespace-nowrap",
  // Digits line up column-wise, which is the whole point of a latency column.
  latencyMs: "whitespace-nowrap tabular-nums",
})

/**
 * `Object.hasOwn` and not a bare index: every object inherits `toString`, and a
 * bare lookup would hand a function to `className`.
 */
export function columnCellClass(column: AuditColumn): string {
  return Object.hasOwn(COLUMN_CELL_CLASSES, column) ? (COLUMN_CELL_CLASSES[column] ?? "") : ""
}
