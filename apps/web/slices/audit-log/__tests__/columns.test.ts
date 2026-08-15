// @vitest-environment node
import { describe, expect, test } from "vitest"
import { COLUMN_CELL_CLASSES, columnCellClass } from "../config/columns"
import { AUDIT_COLUMNS, isAuditColumn } from "../lib/format"
import type { AuditColumn } from "../types"

/**
 * `columnCellClass` is the row renderer's only per-column decision, so it has
 * to be total (every allowlisted column resolves), inert (an unknown name
 * yields nothing rather than an inherited member), and colour-free — status
 * colour belongs to the app tone map, reached through `<StatusBadge>` alone.
 */

const IDENTIFIER_COLUMNS: readonly AuditColumn[] = [
  "requestId",
  "actorId",
  "userId",
  "workspaceId",
  "deviceId",
  "connectionId",
]

describe("columnCellClass", () => {
  test.each(AUDIT_COLUMNS)("resolves %s to a string", (column) => {
    expect(typeof columnCellClass(column)).toBe("string")
  })

  test("a column with no special treatment resolves to nothing", () => {
    expect(columnCellClass("policyDecision")).toBe("")
    expect(columnCellClass("status")).toBe("")
    expect(columnCellClass("errorCode")).toBe("")
  })

  test.each(IDENTIFIER_COLUMNS)("renders %s as an unwrapped identifier", (column) => {
    expect(columnCellClass(column)).toContain("font-mono")
    expect(columnCellClass(column)).toContain("whitespace-nowrap")
  })

  // Every styled cell is nowrap; that is what makes the table overflow its own
  // container instead of squeezing, so audit-table's scroller has something to
  // scroll and the page body never moves sideways.
  test("every styled column keeps its cell on one line", () => {
    for (const [column, className] of Object.entries(COLUMN_CELL_CLASSES)) {
      expect(className, column).toContain("whitespace-nowrap")
    }
  })

  test("latency digits line up column-wise", () => {
    expect(columnCellClass("latencyMs")).toContain("tabular-nums")
  })

  // The reason this is `Object.hasOwn` and not a bare index: every object
  // inherits these, and a bare lookup would hand a function to `className`.
  test.each(["toString", "constructor", "valueOf", "__proto__"])(
    "DENIED: the inherited key %s resolves to nothing",
    (key) => {
      expect(columnCellClass(key as AuditColumn)).toBe("")
    },
  )

  test("DENIED: the table styles nothing outside the audit column allowlist", () => {
    for (const column of Object.keys(COLUMN_CELL_CLASSES)) {
      expect(isAuditColumn(column), column).toBe(true)
    }
  })

  test("DENIED: no status colour is named here — that is the tone map's job", () => {
    for (const [column, className] of Object.entries(COLUMN_CELL_CLASSES)) {
      expect(className, column).not.toMatch(/#|rgb|hsl|success|destructive|accent|warning|danger/)
    }
  })

  test("the map is frozen so a consumer cannot restyle a column in place", () => {
    expect(Object.isFrozen(COLUMN_CELL_CLASSES)).toBe(true)
  })
})
