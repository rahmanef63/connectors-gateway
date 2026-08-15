// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  AUDIT_COLUMNS,
  AUDIT_STATUSES,
  DEFAULT_AUDIT_COLUMNS,
  formatLatency,
  formatTimestamp,
  isAuditColumn,
  redactAuditRecord,
  redactAuditRecords,
  selectAuditColumns,
} from "../lib/format"
import { DEFAULT_AUDIT_LABELS } from "../config/labels"

const EVENT = {
  rowId: "row_1",
  requestId: "req_1",
  timestamp: Date.UTC(2026, 7, 15, 9, 30),
  actorId: "key_1",
  userId: "usr_1",
  connectorId: "blender",
  actionId: "blender.scene.render",
  executorKind: "local",
  policyDecision: "ALLOW",
  status: "success",
  latencyMs: 1234.56,
}

describe("column allowlist", () => {
  test("the allowlist and the label table cover the same columns", () => {
    expect([...AUDIT_COLUMNS].sort()).toEqual(Object.keys(DEFAULT_AUDIT_LABELS.columns).sort())
  })

  test("the default view is a subset of the allowlist", () => {
    for (const column of DEFAULT_AUDIT_COLUMNS) expect(AUDIT_COLUMNS).toContain(column)
  })

  test("isAuditColumn accepts only allowlisted names", () => {
    expect(isAuditColumn("policyDecision")).toBe(true)
    for (const name of ["payload", "input", "output", "authorization", "token", "", 7, null]) {
      expect(isAuditColumn(name)).toBe(false)
    }
  })

  test("selectAuditColumns keeps order, de-duplicates, and drops unknown names", () => {
    expect(selectAuditColumns(["status", "connectorId", "status", "payload", "secret"])).toEqual([
      "status",
      "connectorId",
    ])
  })

  test("DENIED: a request for only unlisted fields falls back to the default view", () => {
    expect(selectAuditColumns(["payload", "requestBody"])).toEqual([...DEFAULT_AUDIT_COLUMNS])
    expect(selectAuditColumns([])).toEqual([...DEFAULT_AUDIT_COLUMNS])
    expect(selectAuditColumns("status")).toEqual([...DEFAULT_AUDIT_COLUMNS])
    expect(selectAuditColumns(undefined)).toEqual([...DEFAULT_AUDIT_COLUMNS])
  })
})

describe("redactAuditRecord", () => {
  test("maps a well-formed event", () => {
    const row = redactAuditRecord(EVENT)
    expect(row?.connectorId).toBe("blender")
    expect(row?.policyDecision).toBe("ALLOW")
    expect(row?.executorKind).toBe("local")
    expect(row?.errorCode).toBeUndefined()
    expect(row?.rowId).toBe("row_1")
  })

  test("synthesises a stable list key when the row carries no id", () => {
    const { rowId: _rowId, ...rest } = EVENT
    expect(redactAuditRecord(rest)?.rowId).toBe(`req_1:${EVENT.timestamp}`)
  })

  test("keeps the optional identifiers when present", () => {
    const row = redactAuditRecord({
      ...EVENT,
      workspaceId: "ws_1",
      deviceId: "dev_1",
      connectionId: "con_1",
      status: "error",
      errorCode: "DEVICE_OFFLINE",
    })
    expect(row?.deviceId).toBe("dev_1")
    expect(row?.errorCode).toBe("DEVICE_OFFLINE")
  })

  test("DENIED: a field outside the allowlist is never copied", () => {
    const row = redactAuditRecord({
      ...EVENT,
      _id: "convex_row_1",
      input: { resume: "/home/operator/cv.pdf" },
      output: "rendered",
      authorization: "Bearer cgk_live_deadbeef",
      tokenCipher: "v1.abc.def",
    })

    expect(row).not.toBeNull()
    // `rowId` is the React key and is never rendered; everything else must be
    // a column the audit view is allowed to show.
    for (const key of Object.keys(row ?? {})) {
      if (key === "rowId") continue
      expect(isAuditColumn(key), key).toBe(true)
    }
    expect(isAuditColumn("rowId")).toBe(false)
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain("Bearer")
    expect(serialized).not.toContain("/home/")
    expect(serialized).not.toContain("tokenCipher")
  })

  test("DENIED: an unknown error code is dropped rather than rendered", () => {
    expect(redactAuditRecord({ ...EVENT, errorCode: "KERNEL_PANIC" })?.errorCode).toBeUndefined()
  })

  test.each<[string, unknown]>([
    ["a string", "req_1"],
    ["null", null],
    ["an array", [EVENT]],
    ["a missing request id", { ...EVENT, requestId: "" }],
    ["a missing timestamp", { ...EVENT, timestamp: undefined }],
    ["a string timestamp", { ...EVENT, timestamp: "2026-08-15" }],
    ["an unknown executor", { ...EVENT, executorKind: "quantum" }],
    ["an unknown decision", { ...EVENT, policyDecision: "allow" }],
    ["an unknown status", { ...EVENT, status: "pending" }],
    ["a non-numeric latency", { ...EVENT, latencyMs: "fast" }],
  ])("DENIED: rejects %s", (_name, input) => {
    expect(redactAuditRecord(input)).toBeNull()
  })
})

describe("redactAuditRecords", () => {
  test("keeps readable rows and drops the rest", () => {
    const rows = redactAuditRecords([EVENT, { ...EVENT, policyDecision: "MAYBE" }, null])
    expect(rows).toHaveLength(1)
  })

  test("returns an empty list for anything that is not an array", () => {
    expect(redactAuditRecords(undefined)).toEqual([])
    expect(redactAuditRecords({ page: [EVENT] })).toEqual([])
  })
})

describe("formatLatency", () => {
  const units = DEFAULT_AUDIT_LABELS.latency

  test("renders sub-second latency in milliseconds", () => {
    expect(formatLatency(0, units, "—")).toBe("0 ms")
    expect(formatLatency(12.4, units, "—")).toBe("12 ms")
    expect(formatLatency(999.4, units, "—")).toBe("999 ms")
  })

  test("switches to seconds at one second", () => {
    expect(formatLatency(1000, units, "—")).toBe("1.00 s")
    expect(formatLatency(1234.56, units, "—")).toBe("1.23 s")
  })

  test("units are caller-supplied copy", () => {
    expect(formatLatency(1500, { milliseconds: "mdet", seconds: "det" }, "-")).toBe("1.50 det")
  })

  test.each<[string, unknown]>([
    ["undefined", undefined],
    ["null", null],
    ["a string", "120ms"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a negative duration", -5],
  ])("DENIED: %s renders the fallback", (_name, value) => {
    expect(formatLatency(value, units, "—")).toBe("—")
  })
})

describe("formatTimestamp", () => {
  const options = { locale: "en-US", timeZone: "UTC" } as const

  test("formats an epoch-ms value in the caller's locale and zone", () => {
    const formatted = formatTimestamp(EVENT.timestamp, "—", options)
    expect(formatted).toContain("2026")
    expect(formatted).toContain("Aug")
  })

  test("the same instant renders differently per time zone", () => {
    expect(formatTimestamp(EVENT.timestamp, "—", options)).not.toBe(
      formatTimestamp(EVENT.timestamp, "—", { locale: "en-US", timeZone: "Asia/Jakarta" }),
    )
  })

  test.each<[string, unknown]>([
    ["undefined", undefined],
    ["zero", 0],
    ["a negative instant", -1],
    ["NaN", Number.NaN],
    ["a string", "yesterday"],
  ])("DENIED: %s renders the fallback, never an Invalid Date", (_name, value) => {
    expect(formatTimestamp(value, "—", options)).toBe("—")
  })
})

describe("status vocabulary", () => {
  test("matches the label table", () => {
    expect([...AUDIT_STATUSES].sort()).toEqual(Object.keys(DEFAULT_AUDIT_LABELS.status).sort())
  })
})
