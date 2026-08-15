import { describe, expect, test } from "vitest"
import { errorCodeOf } from "./errors"
import {
  assertDisplayName,
  assertFutureTimestamp,
  assertIdentifier,
  assertPairingCode,
} from "./input"

function codeOf(run: () => unknown): string | null {
  try {
    run()
    return null
  } catch (error) {
    return errorCodeOf(error)
  }
}

describe("assertIdentifier", () => {
  test("accepts the id shapes @cg/core mints", () => {
    expect(assertIdentifier("dev_ab12", "deviceId")).toBe("dev_ab12")
    expect(assertIdentifier("pair_1a2b3c", "id")).toBe("pair_1a2b3c")
    expect(assertIdentifier("k57abcxyz", "keyId")).toBe("k57abcxyz")
  })

  test("rejects path traversal, spaces, empties and over-long values", () => {
    for (const value of ["", "../../etc/passwd", "dev id", "dev/id", "_leading", "x".repeat(129)]) {
      expect(codeOf(() => assertIdentifier(value, "deviceId"))).toBe("INVALID_INPUT")
    }
  })

  test("never echoes the offending value", () => {
    try {
      assertIdentifier("sk-live-secret-value", "deviceId")
      throw new Error("expected a rejection")
    } catch (error) {
      expect(String((error as { data?: { message?: string } }).data?.message)).not.toContain(
        "sk-live",
      )
    }
  })
})

describe("assertDisplayName", () => {
  test("trims and accepts a normal name", () => {
    expect(assertDisplayName("  Studio laptop ")).toBe("Studio laptop")
  })

  test("rejects blank, over-long and control-character names", () => {
    expect(codeOf(() => assertDisplayName("   "))).toBe("INVALID_INPUT")
    expect(codeOf(() => assertDisplayName("x".repeat(65)))).toBe("INVALID_INPUT")
    expect(codeOf(() => assertDisplayName("laptop\u0000null"))).toBe("INVALID_INPUT")
    expect(codeOf(() => assertDisplayName("line\nbreak"))).toBe("INVALID_INPUT")
    expect(codeOf(() => assertDisplayName("laptop\u007fdel"))).toBe("INVALID_INPUT")
  })
})

describe("assertPairingCode", () => {
  test("normalizes to upper case", () => {
    expect(assertPairingCode(" abcd1234 ")).toBe("ABCD1234")
  })

  test("rejects short, long and out-of-alphabet codes", () => {
    expect(codeOf(() => assertPairingCode("ABC"))).toBe("INVALID_INPUT")
    expect(codeOf(() => assertPairingCode("A".repeat(33)))).toBe("INVALID_INPUT")
    expect(codeOf(() => assertPairingCode("ABCD_123"))).toBe("INVALID_INPUT")
  })
})

describe("assertFutureTimestamp", () => {
  test("accepts a future deadline", () => {
    expect(assertFutureTimestamp(1_000, 999)).toBe(1_000)
  })

  test("rejects a past deadline and a non-finite one", () => {
    expect(codeOf(() => assertFutureTimestamp(999, 999))).toBe("INVALID_INPUT")
    expect(codeOf(() => assertFutureTimestamp(Number.NaN, 1))).toBe("INVALID_INPUT")
    expect(codeOf(() => assertFutureTimestamp(Number.POSITIVE_INFINITY, 1))).toBe("INVALID_INPUT")
  })
})
