import { describe, expect, test } from "vitest"
import { formatPairingCode, parsePairingCode, PAIRING_CODE_LENGTH } from "./pairing-code"

describe("parsePairingCode", () => {
  test("accepts a canonical code", () => {
    expect(parsePairingCode("ABCD2345")).toBe("ABCD2345")
  })

  test("normalises lowercase, spaces and dashes", () => {
    expect(parsePairingCode(" abcd-2345 ")).toBe("ABCD2345")
    expect(parsePairingCode("AB CD 23 45")).toBe("ABCD2345")
  })

  // DENIED cases — every one of these must not reach Convex.
  test("rejects a non-string", () => {
    expect(parsePairingCode(undefined)).toBeNull()
    expect(parsePairingCode(null)).toBeNull()
    expect(parsePairingCode(12345678)).toBeNull()
    expect(parsePairingCode(["ABCD2345"])).toBeNull()
    expect(parsePairingCode({ code: "ABCD2345" })).toBeNull()
  })

  test("rejects the wrong length", () => {
    expect(parsePairingCode("ABCD234")).toBeNull()
    expect(parsePairingCode("ABCD23456")).toBeNull()
    expect(parsePairingCode("")).toBeNull()
  })

  test("rejects look-alike characters excluded from the alphabet", () => {
    expect(parsePairingCode("ABCD2340")).toBeNull() // 0
    expect(parsePairingCode("ABCD2341")).toBeNull() // 1
    expect(parsePairingCode("ABCDI345")).toBeNull() // I
    expect(parsePairingCode("ABCDO345")).toBeNull() // O
  })

  test("rejects injection-shaped input", () => {
    expect(parsePairingCode("<script>")).toBeNull()
    expect(parsePairingCode("../../etc")).toBeNull()
    expect(parsePairingCode("ABCD*345")).toBeNull()
  })

  test("rejects an oversized param without scanning it", () => {
    expect(parsePairingCode("A".repeat(100_000))).toBeNull()
  })

  test("strips separators only up to the fixed length", () => {
    expect(parsePairingCode("A-B-C-D-2-3-4-5")).toBe("ABCD2345")
    expect(parsePairingCode("A-B-C-D-2-3-4-5-6")).toBeNull()
  })
})

describe("formatPairingCode", () => {
  test("splits a canonical code in half", () => {
    expect(formatPairingCode("ABCD2345")).toBe("ABCD-2345")
    expect("ABCD2345".length).toBe(PAIRING_CODE_LENGTH)
  })

  test("puts the extra character in the first group for odd lengths", () => {
    expect(formatPairingCode("ABCDE")).toBe("ABC-DE")
  })
})
