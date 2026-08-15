import { describe, expect, test } from "vitest"
import {
  formatDuration,
  formatExpiry,
  formatPlatform,
  formatRelativeTime,
  formatTimestamp,
} from "./format"

const NOW = 1_700_000_000_000 // 2023-11-14T22:13:20Z

describe("formatTimestamp", () => {
  test("renders a stable UTC string", () => {
    expect(formatTimestamp(NOW)).toBe("2023-11-14 22:13 UTC")
  })

  test("handles the epoch", () => {
    expect(formatTimestamp(0)).toBe("1970-01-01 00:00 UTC")
  })

  test("does not throw on a non-finite value", () => {
    expect(formatTimestamp(Number.NaN)).toBe("unknown")
    expect(formatTimestamp(Number.POSITIVE_INFINITY)).toBe("unknown")
  })
})

describe("formatRelativeTime", () => {
  test("undefined means never seen", () => {
    expect(formatRelativeTime(undefined, NOW)).toBe("never")
    expect(formatRelativeTime(Number.NaN, NOW)).toBe("never")
  })

  test("sub-minute in either direction is just now", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("just now")
    expect(formatRelativeTime(NOW - 59_000, NOW)).toBe("just now")
    expect(formatRelativeTime(NOW + 59_000, NOW)).toBe("just now")
  })

  test("past values", () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe("1 min ago")
    expect(formatRelativeTime(NOW - 90 * 60_000, NOW)).toBe("1 h ago")
    expect(formatRelativeTime(NOW - 50 * 60 * 60_000, NOW)).toBe("2 d ago")
  })

  test("future values", () => {
    expect(formatRelativeTime(NOW + 5 * 60_000, NOW)).toBe("in 5 min")
    expect(formatRelativeTime(NOW + 3 * 3_600_000, NOW)).toBe("in 3 h")
  })

  test("unit boundaries", () => {
    expect(formatRelativeTime(NOW - 3_599_999, NOW)).toBe("59 min ago")
    expect(formatRelativeTime(NOW - 3_600_000, NOW)).toBe("1 h ago")
    expect(formatRelativeTime(NOW - 86_400_000, NOW)).toBe("1 d ago")
  })
})

describe("formatExpiry", () => {
  test("counts down while valid", () => {
    expect(formatExpiry(NOW + 4 * 60_000, NOW)).toBe("expires in 4 min")
  })

  test("expired at and past the boundary", () => {
    expect(formatExpiry(NOW, NOW)).toBe("expired")
    expect(formatExpiry(NOW - 1, NOW)).toBe("expired")
    expect(formatExpiry(Number.NaN, NOW)).toBe("expired")
  })
})

describe("formatPlatform", () => {
  test("maps the three known platforms", () => {
    expect(formatPlatform("windows")).toBe("Windows")
    expect(formatPlatform("macos")).toBe("macOS")
    expect(formatPlatform("linux")).toBe("Linux")
  })

  test("never echoes an unknown platform back into the DOM", () => {
    expect(formatPlatform("<img onerror=alert(1)>")).toBe("Unknown platform")
    expect(formatPlatform("toString")).toBe("Unknown platform")
    expect(formatPlatform("")).toBe("Unknown platform")
  })
})

describe("formatDuration", () => {
  test("milliseconds under a second", () => {
    expect(formatDuration(0)).toBe("0 ms")
    expect(formatDuration(999)).toBe("999 ms")
  })

  test("seconds at and over a second", () => {
    expect(formatDuration(1000)).toBe("1.0 s")
    expect(formatDuration(2450)).toBe("2.5 s")
  })

  test("rejects nonsense", () => {
    expect(formatDuration(-1)).toBe("—")
    expect(formatDuration(Number.NaN)).toBe("—")
  })
})
