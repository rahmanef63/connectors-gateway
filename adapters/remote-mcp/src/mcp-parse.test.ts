import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { readToolResult } from "./mcp-parse"

/** Captures the thrown value, and fails loudly if nothing throws or if what
 *  throws is not a GatewayError — a bare try/catch would quietly turn a typo
 *  into a passing assertion about `undefined`. */
function thrownBy(fn: () => unknown): GatewayError {
  try {
    fn()
  } catch (err) {
    if (err instanceof GatewayError) return err
    throw new Error(`expected a GatewayError, got: ${String(err)}`)
  }
  throw new Error("expected a throw, got a value")
}

describe("readToolResult — upstream error mapping", () => {
  // A server that enforces OAuth scopes per call answers -32003 and names the
  // scope it wanted. That is the one upstream failure the caller can actually
  // fix, so it must not arrive as a generic 502 that reads as "try again".
  const scopeError = {
    jsonrpc: "2.0",
    id: 1,
    error: {
      code: -32003,
      message: "Token ini tidak memiliki izin mcp.write yang dibutuhkan oleh applications_create.",
      data: { required_scope: "mcp.write", granted_scopes: ["mcp.read"] },
    },
  }

  test("maps -32003 to INSUFFICIENT_SCOPE and names the scope to re-authorize for", () => {
    const err = thrownBy(() => readToolResult(scopeError, "tok_secret"))
    expect(err.code).toBe("INSUFFICIENT_SCOPE")
    expect(err.message).toContain("mcp.write")
    expect(err.httpStatus).toBe(403)
  })

  test("falls back cleanly when the upstream omits data.required_scope", () => {
    const err = thrownBy(() =>
      readToolResult({ jsonrpc: "2.0", id: 1, error: { code: -32003, message: "nope" } }, "tok"),
    )
    expect(err.code).toBe("INSUFFICIENT_SCOPE")
  })

  test("still reports any OTHER error code as UPSTREAM_ERROR", () => {
    const err = thrownBy(() =>
      readToolResult({ jsonrpc: "2.0", id: 1, error: { code: -32603, message: "boom" } }, "tok"),
    )
    expect(err.code).toBe("UPSTREAM_ERROR")
    expect(err.httpStatus).toBe(502)
  })

  test("never echoes the bearer back, whichever branch throws", () => {
    for (const code of [-32003, -32603]) {
      const err = thrownBy(() =>
        readToolResult(
          { jsonrpc: "2.0", id: 1, error: { code, message: "rejected tok_secret" } },
          "tok_secret",
        ),
      )
      expect(err.message).not.toContain("tok_secret")
    }
  })
})
