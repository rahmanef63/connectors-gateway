// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  EMPTY_AUDIT_FILTERS,
  applyAuditFilters,
  distinctConnectors,
  isFilterActive,
} from "../lib/filter"
import type { AuditRowView } from "../types"

function row(overrides: Partial<AuditRowView> = {}): AuditRowView {
  return {
    rowId: "row_1",
    requestId: "req_1",
    timestamp: 1,
    actorId: "key_1",
    userId: "usr_1",
    workspaceId: undefined,
    connectorId: "blender",
    actionId: "blender.scene.render",
    executorKind: "local",
    deviceId: undefined,
    connectionId: undefined,
    policyDecision: "ALLOW",
    status: "success",
    latencyMs: 10,
    errorCode: undefined,
    ...overrides,
  }
}

const ROWS: AuditRowView[] = [
  row({ requestId: "a", connectorId: "blender", status: "success" }),
  row({ requestId: "b", connectorId: "careerpack", status: "error" }),
  row({ requestId: "c", connectorId: "blender", status: "error" }),
]

describe("distinctConnectors", () => {
  test("returns each connector once, sorted", () => {
    expect(distinctConnectors(ROWS)).toEqual(["blender", "careerpack"])
  })

  test("returns nothing for an empty page", () => {
    expect(distinctConnectors([])).toEqual([])
  })
})

describe("applyAuditFilters", () => {
  test("the empty filter keeps every row", () => {
    expect(applyAuditFilters(ROWS, EMPTY_AUDIT_FILTERS)).toHaveLength(3)
  })

  test("filters by connector", () => {
    const filtered = applyAuditFilters(ROWS, { connectorId: "blender", status: "" })
    expect(filtered.map((entry) => entry.requestId)).toEqual(["a", "c"])
  })

  test("filters by status", () => {
    const filtered = applyAuditFilters(ROWS, { connectorId: "", status: "error" })
    expect(filtered.map((entry) => entry.requestId)).toEqual(["b", "c"])
  })

  test("combines both predicates", () => {
    const filtered = applyAuditFilters(ROWS, { connectorId: "blender", status: "error" })
    expect(filtered.map((entry) => entry.requestId)).toEqual(["c"])
  })

  test("a connector with no rows filters everything out", () => {
    expect(applyAuditFilters(ROWS, { connectorId: "notion", status: "" })).toEqual([])
  })

  test("does not mutate the input page", () => {
    const before = [...ROWS]
    applyAuditFilters(ROWS, { connectorId: "blender", status: "" })
    expect(ROWS).toEqual(before)
  })
})

describe("isFilterActive", () => {
  test("is false only when nothing is selected", () => {
    expect(isFilterActive(EMPTY_AUDIT_FILTERS)).toBe(false)
    expect(isFilterActive({ connectorId: "blender", status: "" })).toBe(true)
    expect(isFilterActive({ connectorId: "", status: "error" })).toBe(true)
  })

  test("the empty filter constant cannot be mutated by a consumer", () => {
    expect(Object.isFrozen(EMPTY_AUDIT_FILTERS)).toBe(true)
  })
})
