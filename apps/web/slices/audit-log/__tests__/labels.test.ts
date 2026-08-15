// @vitest-environment node
import { describe, expect, test } from "vitest"
import { DEFAULT_AUDIT_LABELS } from "../config/labels"
import { mergeLabels } from "../lib/labels"
import type { LabelOverride } from "../lib/labels"
import type { AuditLabels } from "../types"

describe("mergeLabels", () => {
  test("returns the defaults untouched when nothing is overridden", () => {
    expect(mergeLabels(DEFAULT_AUDIT_LABELS)).toBe(DEFAULT_AUDIT_LABELS)
  })

  test("replaces a top-level string and keeps every sibling", () => {
    const merged = mergeLabels(DEFAULT_AUDIT_LABELS, { panelTitle: "Jejak audit" })
    expect(merged.panelTitle).toBe("Jejak audit")
    expect(merged.loadMore).toBe(DEFAULT_AUDIT_LABELS.loadMore)
  })

  test("merges nested groups leaf by leaf", () => {
    const merged = mergeLabels(DEFAULT_AUDIT_LABELS, {
      decision: { DENY: "Ditolak" },
      columns: { latencyMs: "Durasi" },
      latency: { seconds: "det" },
    })
    expect(merged.decision.DENY).toBe("Ditolak")
    expect(merged.decision.ALLOW).toBe(DEFAULT_AUDIT_LABELS.decision.ALLOW)
    expect(merged.columns.latencyMs).toBe("Durasi")
    expect(merged.columns.timestamp).toBe(DEFAULT_AUDIT_LABELS.columns.timestamp)
    expect(merged.latency.seconds).toBe("det")
    expect(merged.latency.milliseconds).toBe(DEFAULT_AUDIT_LABELS.latency.milliseconds)
  })

  test("does not mutate the defaults", () => {
    const before = DEFAULT_AUDIT_LABELS.decision.DENY
    mergeLabels(DEFAULT_AUDIT_LABELS, { decision: { DENY: "Ditolak" } })
    expect(DEFAULT_AUDIT_LABELS.decision.DENY).toBe(before)
  })

  test("DENIED: non-copy values are ignored, the default stands", () => {
    const hostile = {
      panelTitle: 42,
      emptyCell: ["x"],
      loadMore: null,
      loading: () => "boom",
    } as unknown as LabelOverride<AuditLabels>

    const merged = mergeLabels(DEFAULT_AUDIT_LABELS, hostile)
    expect(merged.panelTitle).toBe(DEFAULT_AUDIT_LABELS.panelTitle)
    expect(merged.emptyCell).toBe(DEFAULT_AUDIT_LABELS.emptyCell)
    expect(merged.loadMore).toBe(DEFAULT_AUDIT_LABELS.loadMore)
    expect(typeof merged.loading).toBe("string")
  })

  test("DENIED: prototype keys never reach the copy tree", () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": "yes"}}') as LabelOverride<AuditLabels>
    const merged = mergeLabels(DEFAULT_AUDIT_LABELS, hostile)

    expect(Object.hasOwn(merged, "polluted")).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
