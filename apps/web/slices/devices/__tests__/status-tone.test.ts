// @vitest-environment node
import { describe, expect, test } from "vitest"
import type { DeviceStatus } from "@cg/core"
import {
  DEVICE_STATUS_TONES as HOST_DEVICE_STATUS_TONES,
  TONES as HOST_TONES,
} from "@/components/status-badge"
import { DEVICE_STATUS_TONES, toneForStatus } from "../config/status-tone"
import { DEFAULT_DEVICES_LABELS } from "../config/labels"

const STATUSES: readonly DeviceStatus[] = ["online", "offline", "revoked"]

describe("device status → tone", () => {
  test("every status resolves to a tone the design system knows", () => {
    for (const status of STATUSES) {
      expect(HOST_TONES).toContain(toneForStatus(status))
    }
    expect(Object.keys(DEVICE_STATUS_TONES).sort()).toEqual([...STATUSES].sort())
  })

  test("revoked is the only danger tone", () => {
    expect(toneForStatus("revoked")).toBe("danger")
    expect(toneForStatus("online")).toBe("success")
    expect(toneForStatus("offline")).toBe("neutral")
  })

  test("agrees with the app's tone SSOT, so every device pill matches", () => {
    // The slice keeps its own map so it can be installed without the host; this
    // is what stops the two drifting into two different greens.
    expect(DEVICE_STATUS_TONES).toEqual(HOST_DEVICE_STATUS_TONES)
  })

  test("no two statuses collapse onto the same tone", () => {
    const tones = STATUSES.map(toneForStatus)
    expect(new Set(tones).size).toBe(STATUSES.length)
  })

  test("the label table covers exactly the same statuses", () => {
    expect(Object.keys(DEFAULT_DEVICES_LABELS.status).sort()).toEqual(Object.keys(DEVICE_STATUS_TONES).sort())
  })

  test("the table is frozen so a consumer cannot repaint a security signal", () => {
    expect(Object.isFrozen(DEVICE_STATUS_TONES)).toBe(true)
  })

  test("DENIED: the slice ships no colour of its own", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync(new URL("../config/status-tone.ts", import.meta.url).pathname, "utf8"),
    )
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toMatch(/\b(?:bg|text|border)-/)
  })
})
