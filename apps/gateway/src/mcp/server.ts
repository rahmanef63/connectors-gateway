/**
 * MCP JSON-RPC adapter (docs/07). A protocol skin over the connector platform:
 * it maps tool calls onto the ONE execution pipeline and adds nothing else.
 *
 * Authentication happens first, before the envelope is even parsed, and the
 * catalog is built from the authenticated principal — a tool name that is not
 * in the caller's own catalog can never reach the pipeline.
 */
import { GatewayError, toGatewayError } from "@cg/core"
import type { ExecutionResult, Principal } from "@cg/core"
import { authenticateCaller } from "@cg/auth"
import type { RequestScope } from "../context"
import { resolveCatalog } from "../catalog"
import type { CatalogDeps } from "../catalog"
import { executeAction } from "../pipeline/execute"
import type { PipelineDeps } from "../pipeline/execute"
import { JSONRPC_ERRORS, jsonRpcError, jsonRpcResult, parseJsonRpcRequest } from "./jsonrpc"
import type { JsonRpcRequest, JsonRpcResponse } from "./jsonrpc"
import { createToolIndex, lookupTool } from "./tool-names"
import { targetsFor, toolsFor } from "./tools"

/**
 * Protocol revisions this server can speak, oldest first.
 *
 * Answering every client with one pinned revision is legal — the spec lets a
 * server reply with a version it supports — but it drops the older clients
 * rather than meeting them: a `2024-11-05` client is told `2025-06-18` and is
 * entitled to disconnect instead of downgrading. Nothing in the dispatcher
 * below differs between these three, so echoing the client's own revision
 * costs one lookup and keeps it connected.
 *
 * NOT implemented, deliberately: `2025-11-25` (icons) and `2026-07-28`, which
 * is the CURRENT revision and a stateless rewrite — no `initialize` handshake
 * at all and a mandatory `server/discover`. That is a transport change, not a
 * string to add to this array.
 */
export const MCP_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18"] as const

/** What an unrecognised or absent request gets: the newest we speak. */
export const MCP_PROTOCOL_VERSION = "2025-06-18"

export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === "string" &&
    (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : MCP_PROTOCOL_VERSION
}

export const SERVER_INFO = { name: "connectors-gateway", version: "0.1.0" } as const

export type McpDeps = PipelineDeps & CatalogDeps

export type McpInput = {
  scope: RequestScope
  token: string | null
  body: unknown
}

export type McpOutcome = { status: number; body?: JsonRpcResponse }

export async function handleMcpRequest(deps: McpDeps, input: McpInput): Promise<McpOutcome> {
  let principal: Principal
  try {
    if (input.token === null) throw new GatewayError("NOT_AUTHENTICATED", "Invalid credentials.")
    principal = await authenticateCaller(input.token, deps.apiKeys)
  } catch {
    return { status: 401, body: jsonRpcError(null, JSONRPC_ERRORS.INVALID_REQUEST, "Unauthorized.") }
  }

  let request: JsonRpcRequest
  try {
    request = parseJsonRpcRequest(input.body)
  } catch (cause) {
    const error = toGatewayError(cause)
    return { status: 400, body: jsonRpcError(null, JSONRPC_ERRORS.INVALID_REQUEST, error.message) }
  }

  // A notification expects no body; `notifications/initialized` is the only one
  // an MCP client sends here, and it needs no work.
  if (request.id === undefined) return { status: 202 }

  try {
    return { status: 200, body: jsonRpcResult(request.id, await dispatch(deps, principal, input, request)) }
  } catch (cause) {
    const error = toGatewayError(cause)
    return { status: 200, body: jsonRpcError(request.id, rpcCodeFor(error.code), error.message) }
  }
}

/** Transport-level failures only; a tool's own failure is a RESULT (see below). */
function rpcCodeFor(code: string): number {
  if (code === "ACTION_NOT_FOUND" || code === "CONNECTOR_NOT_FOUND") {
    return JSONRPC_ERRORS.METHOD_NOT_FOUND
  }
  if (code === "INVALID_INPUT") return JSONRPC_ERRORS.INVALID_PARAMS
  return JSONRPC_ERRORS.INTERNAL
}

async function dispatch(
  deps: McpDeps,
  principal: Principal,
  input: McpInput,
  request: JsonRpcRequest,
): Promise<unknown> {
  switch (request.method) {
    case "initialize":
      return {
        protocolVersion: negotiateProtocolVersion(request.params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      }
    case "ping":
      return {}
    case "tools/list":
      return { tools: toolsFor(await resolveCatalog(deps, principal)) }
    case "tools/call":
      return await callTool(deps, principal, input, request)
    default:
      throw new GatewayError("ACTION_NOT_FOUND", "Unknown method.")
  }
}

async function callTool(
  deps: McpDeps,
  principal: Principal,
  input: McpInput,
  request: JsonRpcRequest,
): Promise<unknown> {
  const entries = await resolveCatalog(deps, principal)
  const target = lookupTool(createToolIndex(targetsFor(entries)), request.params.name)
  const args = request.params.arguments

  const result = await executeAction(deps, {
    scope: input.scope,
    token: input.token,
    principal,
    connectorId: target.connectorId,
    actionId: target.actionId,
    input: typeof args === "object" && args !== null && !Array.isArray(args) ? args : {},
  })
  return toToolResult(result)
}

/**
 * Tool failures are RESULTS, not JSON-RPC errors: the model must be able to see
 * and react to them. The error code travels with the message so a client can
 * distinguish "needs approval" from "device offline".
 */
export function toToolResult(result: ExecutionResult): Record<string, unknown> {
  if (result.status === "error") {
    const error = result.error ?? { code: "INTERNAL", message: "The action failed." }
    return {
      content: [{ type: "text", text: `${error.code}: ${error.message}` }],
      isError: true,
    }
  }
  const output = result.output ?? null
  const body: Record<string, unknown> = {
    content: [{ type: "text", text: JSON.stringify(output) }],
    isError: false,
  }
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    body.structuredContent = output
  }
  if (result.files && result.files.length > 0) body.files = result.files
  return body
}
