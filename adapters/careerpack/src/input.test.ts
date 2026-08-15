import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { toolArguments } from "./input"
import { ACTION_APPLICATION_CREATE, ACTION_PROFILE_READ, MAX_NOTES, MAX_TEXT_FIELD } from "./manifest"

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (cause) {
    return cause instanceof GatewayError ? cause.code : "NOT_A_GATEWAY_ERROR"
  }
  return "NO_ERROR"
}

describe("careerpack.profile.read input", () => {
  test("accepts no input", () => {
    expect(toolArguments(ACTION_PROFILE_READ, undefined)).toEqual({})
    expect(toolArguments(ACTION_PROFILE_READ, {})).toEqual({})
  })

  test("rejects any supplied property", () => {
    expect(codeOf(() => toolArguments(ACTION_PROFILE_READ, { userId: "other-user" }))).toBe("INVALID_INPUT")
  })

  test("rejects a non-object input", () => {
    expect(codeOf(() => toolArguments(ACTION_PROFILE_READ, "everything"))).toBe("INVALID_INPUT")
    expect(codeOf(() => toolArguments(ACTION_PROFILE_READ, ["everything"]))).toBe("INVALID_INPUT")
  })
})

describe("careerpack.application.create input", () => {
  test("keeps the trimmed required fields", () => {
    expect(toolArguments(ACTION_APPLICATION_CREATE, { role: "  SRE  ", company: "Acme" })).toEqual({
      role: "SRE",
      company: "Acme",
    })
  })

  test("passes optional fields through", () => {
    expect(
      toolArguments(ACTION_APPLICATION_CREATE, { role: "SRE", company: "Acme", status: "applied", notes: "referred" }),
    ).toEqual({ role: "SRE", company: "Acme", status: "applied", notes: "referred" })
  })

  test("rejects a missing or blank required field", () => {
    expect(codeOf(() => toolArguments(ACTION_APPLICATION_CREATE, { company: "Acme" }))).toBe("INVALID_INPUT")
    expect(codeOf(() => toolArguments(ACTION_APPLICATION_CREATE, { role: "   ", company: "Acme" }))).toBe("INVALID_INPUT")
    expect(codeOf(() => toolArguments(ACTION_APPLICATION_CREATE, { role: 42, company: "Acme" }))).toBe("INVALID_INPUT")
  })

  test("rejects an oversized field", () => {
    const long = "x".repeat(MAX_TEXT_FIELD + 1)
    expect(codeOf(() => toolArguments(ACTION_APPLICATION_CREATE, { role: long, company: "Acme" }))).toBe("INVALID_INPUT")
    expect(
      codeOf(() =>
        toolArguments(ACTION_APPLICATION_CREATE, { role: "SRE", company: "Acme", notes: "x".repeat(MAX_NOTES + 1) }),
      ),
    ).toBe("INVALID_INPUT")
  })

  test("rejects a status outside the enum", () => {
    expect(codeOf(() => toolArguments(ACTION_APPLICATION_CREATE, { role: "SRE", company: "Acme", status: "hired" }))).toBe(
      "INVALID_INPUT",
    )
  })

  test("rejects unknown properties instead of forwarding them upstream", () => {
    expect(
      codeOf(() => toolArguments(ACTION_APPLICATION_CREATE, { role: "SRE", company: "Acme", userId: "other-user" })),
    ).toBe("INVALID_INPUT")
  })

  test("an unknown action id is ACTION_NOT_FOUND", () => {
    expect(codeOf(() => toolArguments("careerpack.profile.write", {}))).toBe("ACTION_NOT_FOUND")
  })
})
