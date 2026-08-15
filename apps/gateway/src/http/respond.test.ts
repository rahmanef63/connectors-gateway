import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { errorResponse, errorResponseFor, executionResponse, jsonResponse } from "./respond"

describe("jsonResponse", () => {
  test("is never cacheable and declares its type", async () => {
    const response = jsonResponse({ a: 1 })
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(await response.json()).toEqual({ a: 1 })
  })
})

describe("errorResponse", () => {
  test("maps every code to its documented status", () => {
    expect(errorResponse("NOT_AUTHENTICATED", "x").status).toBe(401)
    expect(errorResponse("POLICY_DENIED", "x").status).toBe(403)
    expect(errorResponse("APPROVAL_REQUIRED", "x").status).toBe(409)
    expect(errorResponse("ACTION_NOT_FOUND", "x").status).toBe(404)
    expect(errorResponse("RATE_LIMITED", "x").status).toBe(429)
    expect(errorResponse("DEVICE_OFFLINE", "x").status).toBe(503)
    expect(errorResponse("TIMEOUT", "x").status).toBe(504)
  })
})

describe("errorResponseFor", () => {
  test("keeps a GatewayError's code", async () => {
    const response = errorResponseFor(new GatewayError("INVALID_INPUT", "Bad input."))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: "INVALID_INPUT", message: "Bad input." } })
  })

  test("an unknown throwable becomes an opaque INTERNAL error", async () => {
    const response = errorResponseFor(new Error("connect ECONNREFUSED 10.0.0.4:5432"))
    expect(response.status).toBe(500)
    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe("INTERNAL")
    expect(body.error.message).not.toContain("ECONNREFUSED")
  })
})

describe("executionResponse", () => {
  test("a success carries output, files and a rounded latency", async () => {
    const response = executionResponse({ status: "success", output: { a: 1 }, timingMs: 12.7 })
    expect(await response.json()).toEqual({
      status: "success",
      output: { a: 1 },
      files: [],
      timingMs: 13,
    })
  })

  test("an error result uses the shared error envelope", async () => {
    const response = executionResponse({
      status: "error",
      error: { code: "DEVICE_OFFLINE", message: "No device." },
      timingMs: 1,
    })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: { code: "DEVICE_OFFLINE", message: "No device." },
    })
  })
})
