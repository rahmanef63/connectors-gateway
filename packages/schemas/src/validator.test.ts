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

  test("reuses a registered $id instead of throwing on a duplicate", () => {
    const first = compileSchema(connectorManifestSchema)
    const clone = JSON.parse(JSON.stringify(connectorManifestSchema)) as JsonSchema
    expect(compileSchema(clone)).toBe(first)
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
