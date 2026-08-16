import { describe, expect, test } from "bun:test"
import { ERROR_CODES, GatewayError } from "@cg/core"
import type { JsonSchema } from "@cg/core"
import {
  agentResultSchema,
  connectorManifestSchema,
  deviceCapabilitySchema,
  jobEnvelopeSchema,
} from "./schemas"
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

function validJob(): Record<string, unknown> {
  return {
    id: "job_1",
    protocolVersion: "1",
    issuedAt: 1_755_000_000_000,
    expiresAt: 1_755_000_030_000,
    connector: "blender",
    action: "blender.scene.render",
    input: { resolutionX: 512, resolutionY: 512 },
    requestContext: { requestId: "req_1", userId: "usr_1" },
    nonce: "n_1",
  }
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

describe("job-envelope.schema.json", () => {
  test("accepts a well-formed envelope", () => {
    expect(() => validateOrThrow(jobEnvelopeSchema, validJob(), "Invalid job")).not.toThrow()
  })

  test("rejects a missing nonce", () => {
    const job = validJob()
    delete job["nonce"]
    expect(rejects(jobEnvelopeSchema, job).message).toContain("required:nonce")
  })

  test("rejects smuggled extra fields on a signed payload", () => {
    const job = { ...validJob(), deviceId: "dev_attacker" }
    expect(rejects(jobEnvelopeSchema, job).message).toContain("additionalProperties")
  })

  test("rejects an AI-supplied identity field inside requestContext", () => {
    const job = validJob()
    job["requestContext"] = { requestId: "req_1", userId: "usr_1", isAdmin: true }
    expect(rejects(jobEnvelopeSchema, job).message).toContain("/requestContext additionalProperties")
  })
})

describe("agent-result.schema.json", () => {
  test("accepts success and error results", () => {
    const ok = { jobId: "job_1", status: "success", output: { done: true }, timingMs: 12 }
    const bad = {
      jobId: "job_1",
      status: "error",
      error: { code: "UPSTREAM_ERROR", message: "Blender bridge refused the call." },
      timingMs: 3,
    }
    expect(() => validateOrThrow(agentResultSchema, ok, "Invalid result")).not.toThrow()
    expect(() => validateOrThrow(agentResultSchema, bad, "Invalid result")).not.toThrow()
  })

  test("rejects an error code outside the gateway vocabulary", () => {
    const result = {
      jobId: "job_1",
      status: "error",
      error: { code: "KABOOM", message: "nope" },
      timingMs: 1,
    }
    expect(rejects(agentResultSchema, result).code).toBe("INVALID_INPUT")
  })

  test("rejects a file entry that is missing its gateway ref", () => {
    const result = {
      jobId: "job_1",
      status: "success",
      files: [{ name: "render.png", mimeType: "image/png", sizeBytes: 10 }],
      timingMs: 1,
    }
    expect(rejects(agentResultSchema, result).message).toContain("required:ref")
  })

  test("its error codes stay in sync with @cg/core ERROR_CODES", () => {
    const defs = agentResultSchema["$defs"] as Record<string, JsonSchema>
    const properties = defs["error"]?.["properties"] as Record<string, JsonSchema>
    expect(properties["code"]?.["enum"]).toEqual([...ERROR_CODES])
  })
})

describe("device-capability.schema.json", () => {
  test("accepts a Blender capability report", () => {
    const report = {
      connector: "blender",
      status: "available",
      version: "4.2",
      adapterVersion: "0.1.0",
      capabilities: ["scene.inspect", "scene.render"],
    }
    expect(() => validateOrThrow(deviceCapabilitySchema, report, "Invalid report")).not.toThrow()
  })

  test("rejects a report with no adapterVersion", () => {
    const report = { connector: "blender", status: "available", capabilities: [] }
    expect(rejects(deviceCapabilitySchema, report).message).toContain("required:adapterVersion")
  })

  test("rejects a capability that tries to namespace itself", () => {
    const report = {
      connector: "blender",
      status: "available",
      adapterVersion: "0.1.0",
      capabilities: ["careerpack:application.create"],
    }
    expect(rejects(deviceCapabilitySchema, report).message).toContain("/capabilities/0")
  })
})
