import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { JsonSchema } from "@cg/core"
import { connectorManifestSchema } from "./schemas"
import { compileSchema, validateOrThrow } from "./validator"

function rejects(schema: JsonSchema, value: unknown): GatewayError {
  try {
    validateOrThrow(schema, value, "Invalid")
  } catch (error) {
    expect(error).toBeInstanceOf(GatewayError)
    return error as GatewayError
  }
  throw new Error("expected validateOrThrow to throw")
}

describe("compileSchema", () => {
  test("caches by schema identity", () => {
    const schema: JsonSchema = { type: "string" }
    expect(compileSchema(schema)).toBe(compileSchema(schema))
  })

  test("a clone of a built-in schema compiles instead of throwing on a duplicate $id", () => {
    compileSchema(connectorManifestSchema)
    const clone = JSON.parse(JSON.stringify(connectorManifestSchema)) as JsonSchema
    expect(() => compileSchema(clone)).not.toThrow()
    expect(compileSchema(clone)({ nonsense: true })).toBe(false)
  })

  // Tomorrow's manifests are per-owner rows: `$id` is a name a user picked, so
  // it must decide nothing. Two owners choosing the same one must not swap
  // validators — one would have their input judged by the other's schema.
  test("two different schemas sharing an $id validate independently", () => {
    const $id = "https://example.com/schemas/tenant.schema.json"
    const owned = (key: string, type: string): JsonSchema => ({
      $id,
      type: "object",
      properties: { [key]: { type } },
      required: [key],
      additionalProperties: false,
    })
    const ownerA = owned("a", "string")
    const ownerB = owned("b", "number")

    expect(() => validateOrThrow(ownerA, { a: "x" }, "Invalid")).not.toThrow()
    // Old behaviour: owner B's input was judged by owner A's schema, so valid
    // input was rejected here and A-shaped input sailed through below.
    expect(() => validateOrThrow(ownerB, { b: 1 }, "Invalid")).not.toThrow()
    expect(rejects(ownerB, { a: "x" }).code).toBe("INVALID_INPUT")
    expect(rejects(ownerA, { b: 1 }).code).toBe("INVALID_INPUT")
    expect(compileSchema(ownerA)).not.toBe(compileSchema(ownerB))
  })

  test("a caller-supplied $id cannot claim a built-in schema's validator", () => {
    compileSchema(connectorManifestSchema)
    const impostor: JsonSchema = {
      $id: connectorManifestSchema["$id"] as string,
      type: "object",
      properties: { anything: { type: "boolean" } },
      required: ["anything"],
    }

    expect(() => validateOrThrow(impostor, { anything: true }, "Invalid")).not.toThrow()
    // ...and the built-in still judges by its own rules.
    expect(rejects(connectorManifestSchema, { anything: true }).code).toBe("INVALID_INPUT")
  })

  test("caching is by object identity, not by $id", () => {
    const schema: JsonSchema = { $id: "https://example.com/schemas/same.schema.json", type: "string" }
    const twin: JsonSchema = { ...schema, type: "number" }
    expect(compileSchema(schema)).toBe(compileSchema(schema))
    expect(compileSchema(twin)("nope")).toBe(false)
    expect(compileSchema(schema)("yes")).toBe(true)
  })

  test("throws INVALID_INPUT on a schema that cannot compile", () => {
    try {
      compileSchema({ type: "definitely-not-a-type" })
      throw new Error("expected compileSchema to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(GatewayError)
      expect((error as GatewayError).code).toBe("INVALID_INPUT")
    }
  })
})
