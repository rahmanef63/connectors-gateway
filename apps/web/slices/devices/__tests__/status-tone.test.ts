// @vitest-environment node
import { describe, expect, test } from "vitest"
import type { DeviceStatus } from "@cg/core"
import {
  DEVICE_STATUS_TONES,
  TONE_BADGE_VARIANTS,
  badgeVariantForStatus,
  toneForStatus,
} from "../config/status-tone"
import { DEFAULT_DEVICES_LABELS } from "../config/labels"

const STATUSES: readonly DeviceStatus[] = ["online", "offline", "revoked"]

describe("device status → tone → variant", () => {
  test("every status has a tone and a variant", () => {
    for (const status of STATUSES) {
      expect(DEVICE_STATUS_TONES[status]).toBeTypeOf("string")
      expect(TONE_BADGE_VARIANTS[DEVICE_STATUS_TONES[status]]).toBeTypeOf("string")
    }
    expect(Object.keys(DEVICE_STATUS_TONES).sort()).toEqual([...STATUSES].sort())
  })

  test("revoked is the only danger tone", () => {
    expect(toneForStatus("revoked")).toBe("danger")
    expect(toneForStatus("online")).toBe("positive")
    expect(toneForStatus("offline")).toBe("neutral")
  })

  test("variant lookup never collapses two statuses onto one variant", () => {
    const variants = STATUSES.map(badgeVariantForStatus)
    expect(new Set(variants).size).toBe(STATUSES.length)
  })

  test("the label table covers exactly the same statuses", () => {
    expect(Object.keys(DEFAULT_DEVICES_LABELS.status).sort()).toEqual(Object.keys(DEVICE_STATUS_TONES).sort())
  })

  test("tables are frozen so a consumer cannot repaint a security signal", () => {
    expect(Object.isFrozen(DEVICE_STATUS_TONES)).toBe(true)
    expect(Object.isFrozen(TONE_BADGE_VARIANTS)).toBe(true)
  })
})
