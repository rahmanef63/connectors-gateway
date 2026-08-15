import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { JsonSchema } from "@cg/core"
import { validateActionInput } from "./action-input"

const SCHEMA: JsonSchema = {
  type: "object",
  required: ["jobTitle"],
  properties: {
    jobTitle: { type: "string", minLength: 1, maxLength: 200 },
    notes: { type: "string", maxLength: 10 },
  },
  additionalProperties: false,
}

function expectRejected(input: unknown): GatewayError {
  try {
    validateActionInput(SCHEMA, input)
  } catch (error) {
    expect(error).toBeInstanceOf(GatewayError)
    return error as GatewayError
  }
  throw new Error("expected validateActionInput to throw")
}

describe("validateActionInput", () => {
  test("returns the input unchanged when it matches", () => {
    const input = { jobTitle: "Staff Engineer" }
    expect(validateActionInput(SCHEMA, input)).toBe(input)
  })

  test("rejects a missing required field", () => {
    const error = expectRejected({ notes: "hi" })
    expect(error.code).toBe("INVALID_INPUT")
    expect(error.message).toContain("required:jobTitle")
  })

  test("rejects an unexpected extra field", () => {
    const error = expectRejected({ jobTitle: "Dev", userId: "usr_someone_else" })
    expect(error.code).toBe("INVALID_INPUT")
    expect(error.message).toContain("additionalProperties")
  })

  test("never echoes the offending value — it may be a secret", () => {
    const secret = "sk-live-51H9xTOPSECRET"
    const error = expectRejected({ jobTitle: secret.repeat(20), notes: secret })

    expect(error.message).not.toContain(secret)
    expect(error.message).not.toContain("sk-live")
    expect(error.message).toContain("/jobTitle")
    expect(error.message).toContain("/notes")
  })

  test("never echoes an absolute local path", () => {
    const error = expectRejected({ jobTitle: 1, notes: "/home/someone/.ssh/id_ed25519" })
    expect(error.message).not.toContain("/home/someone")
    expect(error.message).not.toContain("id_ed25519")
  })

  test("reports every failure at once, capped", () => {
    const wide: JsonSchema = {
      type: "object",
      required: Array.from({ length: 25 }, (_, i) => `f${i}`),
      additionalProperties: false,
    }
    let message = ""
    try {
      validateActionInput(wide, {})
    } catch (error) {
      message = (error as GatewayError).message
    }
    expect(message).toContain("+15 more")
  })

  test("rejects a non-object input", () => {
    expect(expectRejected("just a string").code).toBe("INVALID_INPUT")
    expect(expectRejected(null).code).toBe("INVALID_INPUT")
  })
})
