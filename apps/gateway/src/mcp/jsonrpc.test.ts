import { describe, expect, test } from "bun:test"
import { jsonRpcError, jsonRpcResult, parseJsonRpcRequest } from "./jsonrpc"

describe("parseJsonRpcRequest", () => {
  test("accepts a well-formed request", () => {
    expect(parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "ping", params: { a: 1 } })).toEqual({
      id: 1,
      method: "ping",
      params: { a: 1 },
    })
  })

  test("a missing id marks a notification", () => {
    const parsed = parseJsonRpcRequest({ jsonrpc: "2.0", method: "notifications/initialized" })
    expect(parsed.id).toBeUndefined()
    expect(parsed.params).toEqual({})
  })

  test("rejects a wrong protocol version", () => {
    expect(() => parseJsonRpcRequest({ jsonrpc: "1.0", method: "ping" })).toThrow()
  })

  test("rejects a batch array", () => {
    expect(() => parseJsonRpcRequest([{ jsonrpc: "2.0", method: "ping" }])).toThrow()
  })

  test("rejects a missing or non-string method", () => {
    expect(() => parseJsonRpcRequest({ jsonrpc: "2.0", id: 1 })).toThrow()
    expect(() => parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: 7 })).toThrow()
  })

  test("rejects an over-long method name", () => {
    expect(() => parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "m".repeat(500) })).toThrow()
  })

  test("rejects an object id", () => {
    expect(() => parseJsonRpcRequest({ jsonrpc: "2.0", id: {}, method: "ping" })).toThrow()
  })

  test("array or scalar params degrade to an empty object", () => {
    expect(parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "ping", params: [1] }).params).toEqual({})
    expect(parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "ping", params: 5 }).params).toEqual({})
  })
})

describe("response shaping", () => {
  test("result carries the id", () => {
    expect(jsonRpcResult(3, { ok: true })).toEqual({ jsonrpc: "2.0", id: 3, result: { ok: true } })
  })

  test("error data is included only when supplied", () => {
    expect(jsonRpcError(7, -32022, "Unsupported.", { supported: ["2026-07-28"] })).toEqual({
      jsonrpc: "2.0",
      id: 7,
      error: {
        code: -32022,
        message: "Unsupported.",
        data: { supported: ["2026-07-28"] },
      },
    })
  })

  test("error carries the code and a null id when unknown", () => {
    expect(jsonRpcError(null, -32600, "Unauthorized.")).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Unauthorized." },
    })
  })
})
