import { describe, expect, test } from "vitest"
import { ConvexError } from "convex/values"
import { ERROR_CODES } from "@cg/core"
import { errorCodeOf, fail, isControlPlaneErrorCode } from "./errors"

describe("fail", () => {
  test("throws a ConvexError carrying a typed code", () => {
    try {
      fail("POLICY_DENIED", "Denied.")
      throw new Error("expected a rejection")
    } catch (error) {
      expect(error).toBeInstanceOf(ConvexError)
      expect(errorCodeOf(error)).toBe("POLICY_DENIED")
    }
  })
})

describe("errorCodeOf", () => {
  test("returns null for anything that is not a control-plane error", () => {
    expect(errorCodeOf(new Error("boom"))).toBeNull()
    expect(errorCodeOf(new ConvexError("plain string payload"))).toBeNull()
    expect(errorCodeOf(new ConvexError({ code: "NOT_A_REAL_CODE", message: "x" }))).toBeNull()
    expect(errorCodeOf(null)).toBeNull()
  })
})

describe("isControlPlaneErrorCode", () => {
  test("matches the @cg/core vocabulary exactly", () => {
    expect(ERROR_CODES).toContain("NOT_AUTHORIZED")
    expect(isControlPlaneErrorCode("INVALID_INPUT")).toBe(true)
    expect(isControlPlaneErrorCode("invalid_input")).toBe(false)
    expect(isControlPlaneErrorCode(42)).toBe(false)
  })
})
