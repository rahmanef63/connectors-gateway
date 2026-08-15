// @vitest-environment node
import { describe, expect, test } from "vitest"
import { ConvexError } from "convex/values"

import { extractErrorCode, resolveErrorMessage, type ErrorCopy } from "../convex-error"

const COPY: ErrorCopy = Object.freeze({
  fallback: "Something went wrong. Try again.",
  NOT_AUTHORIZED: "That does not belong to this account.",
  INVALID_INPUT: "Those details are not valid.",
})

describe("extractErrorCode", () => {
  test("reads a structured ConvexError payload", () => {
    expect(extractErrorCode(new ConvexError({ code: "NOT_AUTHORIZED", message: "nope" }))).toBe(
      "NOT_AUTHORIZED",
    )
  })

  test("reads a bare string payload", () => {
    expect(extractErrorCode(new ConvexError("RATE_LIMITED"))).toBe("RATE_LIMITED")
  })

  test.each<[string, unknown]>([
    ["a plain Error", new Error("Server Error: postgres://user:pass@host")],
    ["a thrown string", "NOT_AUTHORIZED"],
    ["undefined", undefined],
    ["a ConvexError with no code", new ConvexError({ detail: "x" })],
    ["a ConvexError with a numeric code", new ConvexError({ code: 403 })],
    ["a ConvexError with an empty code", new ConvexError({ code: "" })],
  ])("returns undefined for %s", (_name, error) => {
    expect(extractErrorCode(error)).toBeUndefined()
  })
})

describe("resolveErrorMessage", () => {
  test("maps a known code to its copy", () => {
    expect(resolveErrorMessage(new ConvexError({ code: "NOT_AUTHORIZED" }), COPY)).toBe(
      COPY.NOT_AUTHORIZED,
    )
  })

  test("falls back for a code this surface has no copy for", () => {
    expect(resolveErrorMessage(new ConvexError({ code: "REPLAY_DETECTED" }), COPY)).toBe(
      COPY.fallback,
    )
  })

  test("DENIED: a server message is never surfaced", () => {
    const leaky = new ConvexError({
      code: "INVALID_INPUT",
      message: "apiKeys row j57abc rejected: secretHash pbkdf2$sha256$210000$…",
    })
    const shown = resolveErrorMessage(leaky, COPY)
    expect(shown).toBe(COPY.INVALID_INPUT)
    expect(shown).not.toContain("pbkdf2")
    expect(shown).not.toContain("j57abc")
  })

  test("DENIED: a raw Error message is never surfaced either", () => {
    const shown = resolveErrorMessage(new Error("Bearer cgk_key_abc_deadbeef"), COPY)
    expect(shown).toBe(COPY.fallback)
    expect(shown).not.toContain("cgk_")
  })

  test("DENIED: an inherited key is not treated as copy", () => {
    for (const code of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(resolveErrorMessage(new ConvexError({ code }), COPY)).toBe(COPY.fallback)
    }
  })
})
