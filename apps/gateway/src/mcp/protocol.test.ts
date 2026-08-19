import { describe, expect, test } from "bun:test"
import type { JsonRpcRequest } from "./jsonrpc"
import {
  completeModernResult,
  isModernMcpRequest,
  MCP_META_KEYS,
  MCP_MODERN_PROTOCOL_VERSION,
  MCP_PROTOCOL_ERRORS,
  McpProtocolError,
  validateModernMcpRequest,
} from "./protocol"

function request(
  method: string,
  params: Record<string, unknown> = {},
): JsonRpcRequest {
  return {
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        [MCP_META_KEYS.protocolVersion]: MCP_MODERN_PROTOCOL_VERSION,
        [MCP_META_KEYS.clientCapabilities]: {},
      },
    },
  }
}

const headers = (overrides: Partial<{ protocolVersion: string | null; method: string | null; name: string | null }> = {}) => ({
  protocolVersion: MCP_MODERN_PROTOCOL_VERSION,
  method: "tools/list",
  name: null,
  ...overrides,
})

describe("modern MCP request validation", () => {
  test("recognizes the stateless protocol without mistaking a legacy version header for it", () => {
    expect(isModernMcpRequest(request("tools/list"), headers())).toBe(true)
    expect(
      isModernMcpRequest(
        { id: 1, method: "tools/list", params: {} },
        { protocolVersion: "2025-06-18", method: null, name: null },
      ),
    ).toBe(false)
  })

  test("accepts matching version, method and tool name headers", () => {
    const body = request("tools/call", { name: "mso_fs_read", arguments: {} })
    expect(() =>
      validateModernMcpRequest(
        body,
        headers({ method: "tools/call", name: "mso_fs_read" }),
      ),
    ).not.toThrow()
  })

  test("accepts the exact Base64 sentinel for non-ASCII names", () => {
    const name = "alat_\u2603"
    const encoded = btoa(unescape(encodeURIComponent(name)))
    const body = request("tools/call", { name })
    expect(() =>
      validateModernMcpRequest(
        body,
        headers({ method: "tools/call", name: `=?base64?${encoded}?=` }),
      ),
    ).not.toThrow()
  })

  test.each([
    ["version", headers({ protocolVersion: "2025-06-18" })],
    ["method", headers({ method: "ping" })],
  ])("rejects a mismatched %s header with HEADER_MISMATCH", (_label, transport) => {
    try {
      validateModernMcpRequest(request("tools/list"), transport)
      throw new Error("expected validation to fail")
    } catch (cause) {
      expect(cause).toBeInstanceOf(McpProtocolError)
      expect((cause as McpProtocolError).code).toBe(MCP_PROTOCOL_ERRORS.HEADER_MISMATCH)
      expect((cause as McpProtocolError).status).toBe(400)
    }
  })

  test("rejects a missing or malformed Mcp-Name instead of routing a different target", () => {
    const body = request("tools/call", { name: "mso_fs_read" })
    for (const name of [null, "other_tool", "=?base64?not-base64?="]) {
      expect(() =>
        validateModernMcpRequest(body, headers({ method: "tools/call", name })),
      ).toThrow(McpProtocolError)
    }
  })

  test("returns the dedicated unsupported-version error and supported list", () => {
    const body = request("tools/list")
    const meta = body.params._meta as Record<string, unknown>
    meta[MCP_META_KEYS.protocolVersion] = "2099-01-01"
    try {
      validateModernMcpRequest(
        body,
        headers({ protocolVersion: "2099-01-01" }),
      )
      throw new Error("expected validation to fail")
    } catch (cause) {
      expect(cause).toBeInstanceOf(McpProtocolError)
      expect((cause as McpProtocolError).code).toBe(
        MCP_PROTOCOL_ERRORS.UNSUPPORTED_PROTOCOL_VERSION,
      )
      expect((cause as McpProtocolError).data).toEqual({
        supported: [MCP_MODERN_PROTOCOL_VERSION],
        requested: "2099-01-01",
      })
    }
  })

  test("requires per-request client capabilities", () => {
    const body = request("tools/list")
    delete (body.params._meta as Record<string, unknown>)[MCP_META_KEYS.clientCapabilities]
    expect(() => validateModernMcpRequest(body, headers())).toThrow(McpProtocolError)
  })
})

describe("modern result envelope", () => {
  test("marks results complete and attaches server identity without dropping metadata", () => {
    expect(
      completeModernResult(
        { value: 1, _meta: { "com.example/existing": true } },
        { name: "server", version: "1" },
      ),
    ).toEqual({
      value: 1,
      resultType: "complete",
      _meta: {
        "com.example/existing": true,
        [MCP_META_KEYS.serverInfo]: { name: "server", version: "1" },
      },
    })
  })
})
