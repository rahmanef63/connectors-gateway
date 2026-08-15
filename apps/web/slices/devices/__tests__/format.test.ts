// @vitest-environment node
import { describe, expect, test } from "vitest"
import { formatLastSeen, formatTimestamp } from "../lib/format"

const FIXED = Date.UTC(2026, 7, 15, 9, 30)
const OPTIONS = { locale: "en-US", timeZone: "UTC" } as const

describe("formatTimestamp", () => {
  test("formats an epoch-ms value in the caller's locale and zone", () => {
    const formatted = formatTimestamp(FIXED, OPTIONS)
    expect(formatted).toContain("2026")
    expect(formatted).toContain("Aug")
    expect(formatted).toContain("15")
  })

  test("the same instant renders differently per time zone", () => {
    const utc = formatTimestamp(FIXED, OPTIONS)
    const jakarta = formatTimestamp(FIXED, { locale: "en-US", timeZone: "Asia/Jakarta" })
    expect(utc).not.toBe(jakarta)
  })

  test.each<[string, unknown]>([
    ["undefined", undefined],
    ["null", null],
    ["a string", "2026-08-15"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["zero", 0],
    ["a negative instant", -1],
  ])("DENIED: %s renders the fallback, never an Invalid Date", (_name, value) => {
    expect(formatTimestamp(value, OPTIONS)).toBe("—")
  })

  test("the fallback is caller-supplied copy", () => {
    expect(formatTimestamp(undefined, { ...OPTIONS, fallback: "belum pernah" })).toBe("belum pernah")
  })
})

describe("formatLastSeen", () => {
  test("uses the never label when the device has not connected", () => {
    expect(formatLastSeen(undefined, "Never connected", OPTIONS)).toBe("Never connected")
  })

  test("formats a real last-seen instant", () => {
    expect(formatLastSeen(FIXED, "Never connected", OPTIONS)).toContain("2026")
  })
})
