// @vitest-environment node
import { describe, expect, test } from "vitest"
import { DEFAULT_DEVICES_LABELS } from "../config/labels"
import { mergeLabels } from "../lib/labels"
import type { LabelOverride } from "../lib/labels"
import type { DevicesLabels } from "../types"

describe("mergeLabels", () => {
  test("returns the defaults untouched when nothing is overridden", () => {
    expect(mergeLabels(DEFAULT_DEVICES_LABELS)).toBe(DEFAULT_DEVICES_LABELS)
  })

  test("replaces a top-level string and keeps every sibling", () => {
    const merged = mergeLabels(DEFAULT_DEVICES_LABELS, { panelTitle: "Machines" })
    expect(merged.panelTitle).toBe("Machines")
    expect(merged.panelDescription).toBe(DEFAULT_DEVICES_LABELS.panelDescription)
    expect(merged.revoke.confirm).toBe(DEFAULT_DEVICES_LABELS.revoke.confirm)
  })

  test("merges nested groups leaf by leaf", () => {
    const merged = mergeLabels(DEFAULT_DEVICES_LABELS, {
      revoke: { confirm: "Cut it off" },
      status: { online: "Connected" },
    })
    expect(merged.revoke.confirm).toBe("Cut it off")
    expect(merged.revoke.cancel).toBe(DEFAULT_DEVICES_LABELS.revoke.cancel)
    expect(merged.status.online).toBe("Connected")
    expect(merged.status.revoked).toBe(DEFAULT_DEVICES_LABELS.status.revoked)
  })

  test("does not mutate the defaults", () => {
    const before = DEFAULT_DEVICES_LABELS.panelTitle
    mergeLabels(DEFAULT_DEVICES_LABELS, { panelTitle: "Something else" })
    expect(DEFAULT_DEVICES_LABELS.panelTitle).toBe(before)
  })

  test("accepts an extra error code the consumer knows about", () => {
    const merged = mergeLabels(DEFAULT_DEVICES_LABELS, { errors: { POLICY_DENIED: "Blocked by policy." } })
    expect(merged.errors.POLICY_DENIED).toBe("Blocked by policy.")
    expect(merged.errors.fallback).toBe(DEFAULT_DEVICES_LABELS.errors.fallback)
  })

  test("DENIED: non-copy values are ignored, the default stands", () => {
    const hostile = {
      panelTitle: 42,
      panelDescription: ["a", "b"],
      loading: null,
      emptyTitle: () => "boom",
    } as unknown as LabelOverride<DevicesLabels>

    const merged = mergeLabels(DEFAULT_DEVICES_LABELS, hostile)
    expect(merged.panelTitle).toBe(DEFAULT_DEVICES_LABELS.panelTitle)
    expect(merged.panelDescription).toBe(DEFAULT_DEVICES_LABELS.panelDescription)
    expect(merged.loading).toBe(DEFAULT_DEVICES_LABELS.loading)
    expect(typeof merged.emptyTitle).toBe("string")
  })

  test("DENIED: prototype keys never reach the copy tree", () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": "yes"}, "constructor": {"x": "y"}}') as LabelOverride<DevicesLabels>
    const merged = mergeLabels(DEFAULT_DEVICES_LABELS, hostile)

    expect(Object.hasOwn(merged, "polluted")).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(merged.panelTitle).toBe(DEFAULT_DEVICES_LABELS.panelTitle)
  })
})
