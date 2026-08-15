/**
 * Minimal JSON-RPC 2.0 framing for the MCP endpoint.
 *
 * A request body is untrusted: the envelope is validated before any method
 * name or params object is read (AGENTS.md P0).
 */
import { GatewayError } from "@cg/core"

export type JsonRpcId = string | number

export const JSONRPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const

export type JsonRpcRequest = {
  /** Absent means notification: the client expects no response. */
  id?: JsonRpcId
  method: string
  params: Record<string, unknown>
}

const MAX_METHOD_LENGTH = 128

function invalidRequest(message: string): GatewayError {
  return new GatewayError("INVALID_INPUT", message)
}

export function parseJsonRpcRequest(value: unknown): JsonRpcRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    // Batches are out of scope for the MVP; MCP clients do not require them.
    throw invalidRequest("A JSON-RPC request must be a single object.")
  }
  const body = value as Record<string, unknown>
  if (body.jsonrpc !== "2.0") throw invalidRequest("Unsupported JSON-RPC version.")
  if (typeof body.method !== "string" || body.method.length === 0) {
    throw invalidRequest("A JSON-RPC request needs a method.")
  }
  if (body.method.length > MAX_METHOD_LENGTH) throw invalidRequest("The method name is too long.")

  const id = body.id
  if (id !== undefined && typeof id !== "string" && typeof id !== "number") {
    throw invalidRequest("A JSON-RPC id must be a string or a number.")
  }
  const params =
    typeof body.params === "object" && body.params !== null && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : {}

  return id === undefined ? { method: body.method, params } : { id, method: body.method, params }
}

export type JsonRpcResponse = Record<string, unknown>

export function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result }
}

export function jsonRpcError(id: JsonRpcId | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } }
}
