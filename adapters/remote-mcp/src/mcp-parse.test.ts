import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { readToolResult } from "./mcp-parse"
import { credentialHeaderFor } from "./mcp-client"

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

describe("credentialHeaderFor — how the credential reaches the upstream", () => {
  test("defaults to Authorization: Bearer, so nothing changes for existing connectors", () => {
    expect(credentialHeaderFor(undefined, "tok")).toEqual({
      name: "Authorization",
      value: "Bearer tok",
    })
    expect(credentialHeaderFor({ type: "bearer" } as never, "tok").value).toBe("Bearer tok")
  })

  test("sends a bare value for a non-Authorization header", () => {
    // The bug this prevents: prefixing an API key with "Bearer " makes the
    // upstream compare "Bearer sk-1" against "sk-1" and reject a correct key.
    expect(credentialHeaderFor({ type: "api_key", header: "x-api-key" } as never, "sk-1")).toEqual({
      name: "x-api-key",
      value: "sk-1",
    })
  })

  test("honours an explicit scheme when a server wants one", () => {
    expect(
      credentialHeaderFor({ type: "custom", header: "X-Auth", scheme: "Token " } as never, "t")
        .value,
    ).toBe("Token t")
  })

  test("refuses a header name that could smuggle a second header", () => {
    for (const bad of ["X-Bad: y\r\nX-Evil", "has space", "x".repeat(65), "x:y"]) {
      expect(() => credentialHeaderFor({ type: "api_key", header: bad } as never, "t")).toThrow()
    }
  })

  test("treats an empty header as 'not declared' rather than as an error", () => {
    // Falling back is right: a manifest that sets the field to "" is saying
    // nothing, and failing the call would be a worse answer than the default.
    expect(credentialHeaderFor({ type: "bearer", header: "  " } as never, "t").name).toBe(
      "Authorization",
    )
  })
})
