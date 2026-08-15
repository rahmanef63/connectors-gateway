/**
 * Minimal remote-MCP client: one JSON-RPC 2.0 `tools/call` over HTTP POST.
 *
 * ponytail: no `initialize` handshake, no session id, no SSE streaming state, no retry.
 * CareerPack's remote server answers a single-shot tools/call, which is all the MVP needs.
 * Upgrade path is the official MCP TypeScript SDK transport once sessions, sampling, or
 * progress notifications are required.
 */
import { GatewayError } from "@cg/core"
import { parseRpcBody, readToolResult } from "./mcp-parse"

/** Pinned revision: streamable-HTTP servers reject calls carrying an unknown version. */
export const MCP_PROTOCOL_VERSION = "2025-06-18"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

let requestCounter = 0

/**
 * Call one upstream MCP tool and return its payload.
 * `token` leaves this module only inside the Authorization header — never in a thrown
 * error, never in the returned value.
 */
export async function callTool(
  baseUrl: string,
  token: string,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const endpoint = endpointFor(baseUrl)
  if (signal.aborted) {
    throw new GatewayError("CANCELLED", "The CareerPack call was cancelled.")
  }

  requestCounter += 1
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: requestCounter,
    method: "tools/call",
    params: { name, arguments: args },
  })

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      },
      body,
      signal,
    })
  } catch (cause) {
    throw transportError(cause)
  }

  if (!response.ok) {
    // Only the status is surfaced: an upstream error body may repeat the bearer.
    throw new GatewayError("UPSTREAM_ERROR", `CareerPack refused the call (HTTP ${response.status}).`)
  }

  const raw = await response.text()
  return readToolResult(parseRpcBody(raw, response.headers.get("content-type")), token)
}

/** The endpoint comes from stored connection config, but it is still validated. */
function endpointFor(baseUrl: string): URL {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new GatewayError("UPSTREAM_ERROR", "The CareerPack connection has an invalid endpoint URL.")
  }
  const isLoopback = LOOPBACK_HOSTS.has(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new GatewayError("UPSTREAM_ERROR", "CareerPack must be reached over HTTPS.")
  }
  return url
}

function transportError(cause: unknown): GatewayError {
  const name = cause instanceof Error ? cause.name : ""
  if (name === "AbortError") return new GatewayError("CANCELLED", "The CareerPack call was cancelled.")
  if (name === "TimeoutError") return new GatewayError("TIMEOUT", "The CareerPack call timed out.")
  // The raw network error is dropped: it can carry the request headers.
  return new GatewayError("UPSTREAM_ERROR", "CareerPack is unreachable.")
}
