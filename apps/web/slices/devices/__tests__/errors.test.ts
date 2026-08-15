// @vitest-environment node
import { describe, expect, test } from "vitest"
import { ConvexError } from "convex/values"
import { DEFAULT_DEVICES_LABELS } from "../config/labels"
import { extractErrorCode, resolveErrorMessage } from "../lib/errors"

const MESSAGES = DEFAULT_DEVICES_LABELS.errors

describe("extractErrorCode", () => {
  test("reads a structured ConvexError payload", () => {
    expect(extractErrorCode(new ConvexError({ code: "NOT_AUTHORIZED", message: "nope" }))).toBe("NOT_AUTHORIZED")
  })

  test("reads a bare string payload", () => {
    expect(extractErrorCode(new ConvexError("RATE_LIMITED"))).toBe("RATE_LIMITED")
  })

  test.each<[string, unknown]>([
    ["a plain Error", new Error("Server Error: connection string postgres://u:p@host")],
    ["a thrown string", "NOT_AUTHORIZED"],
    ["undefined", undefined],
    ["a ConvexError with no code", new ConvexError({ detail: "x" })],
    ["a ConvexError with a numeric code", new ConvexError({ code: 403 })],
  ])("returns undefined for %s", (_name, error) => {
    expect(extractErrorCode(error)).toBeUndefined()
  })
})

describe("resolveErrorMessage", () => {
  test("maps a known code to its copy", () => {
    expect(resolveErrorMessage(new ConvexError({ code: "NOT_AUTHORIZED" }), MESSAGES)).toBe(
      MESSAGES.NOT_AUTHORIZED,
    )
  })

  test("falls back for a code the slice has no copy for", () => {
    expect(resolveErrorMessage(new ConvexError({ code: "REPLAY_DETECTED" }), MESSAGES)).toBe(MESSAGES.fallback)
  })

  test("DENIED: a server message is never surfaced to the user", () => {
    const leaky = new ConvexError({
      code: "INTERNAL",
      message: "device credential cgd_abc123 rejected at /home/rahman/agent/state.json",
    })
    const shown = resolveErrorMessage(leaky, MESSAGES)
    expect(shown).toBe(MESSAGES.INTERNAL)
    expect(shown).not.toContain("cgd_abc123")
    expect(shown).not.toContain("/home/")
  })

  test("DENIED: a raw Error message is never surfaced either", () => {
    const shown = resolveErrorMessage(new Error("Bearer cgk_live_deadbeef"), MESSAGES)
    expect(shown).toBe(MESSAGES.fallback)
    expect(shown).not.toContain("cgk_live")
  })

  test("DENIED: a prototype key is not treated as a message", () => {
    expect(resolveErrorMessage(new ConvexError({ code: "__proto__" }), MESSAGES)).toBe(MESSAGES.fallback)
    expect(resolveErrorMessage(new ConvexError({ code: "constructor" }), MESSAGES)).toBe(MESSAGES.fallback)
  })
})
