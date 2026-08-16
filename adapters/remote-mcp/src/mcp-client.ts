/**
 * Minimal remote-MCP client: one JSON-RPC 2.0 `tools/call` over HTTP POST.
 *
 * Server-agnostic on purpose — `baseUrl`, `token` and `name` are the only inputs, so the
 * same function reaches every remote MCP server in the catalog (docs/16).
 *
 * ponytail: no `initialize` handshake, no session id, no SSE streaming state, no retry.
 * The servers we connect answer a single-shot tools/call, which is all the MVP needs.
 * Upgrade path is the official MCP TypeScript SDK transport once sessions, sampling, or
 * progress notifications are required.
 */
import { GatewayError } from "@cg/core"
import { parseRpcBody, readToolResult } from "./mcp-parse"

/** Pinned revision: streamable-HTTP servers reject calls carrying an unknown version. */
export const MCP_PROTOCOL_VERSION = "2025-06-18"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

/**
 * A tools/call result is a record or an id, not a download. 1 MiB is far above anything
 * these servers return and far below what would matter if a compromised or impersonated
 * endpoint answered with an endless stream: without a cap, one call can exhaust the
 * gateway's memory for every other tenant.
 */
export const MAX_RESPONSE_BYTES = 1_048_576

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
    throw new GatewayError("CANCELLED", "The upstream call was cancelled.")
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
      // `manual` over `error` so a redirect is reported as a redirect rather than as an
      // indistinguishable TypeError. Either way the hop is never taken: fetch replays the
      // Authorization header on a cross-origin redirect in some runtimes, so following a
      // 302 would hand this connection's bearer to whatever host Location names.
      redirect: "manual",
    })
  } catch (cause) {
    throw transportError(cause)
  }

  // A runtime that returns an opaque redirect reports status 0, which is not a 3xx.
  if (isRedirect(response)) {
    // The Location value is deliberately not echoed: it is attacker-chosen text.
    throw new GatewayError(
      "UPSTREAM_ERROR",
      "The upstream server redirected the call; the credential was not forwarded.",
    )
  }

  if (!response.ok) {
    // Only the status is surfaced: an upstream error body may repeat the bearer.
    throw new GatewayError(
      "UPSTREAM_ERROR",
      `The upstream server refused the call (HTTP ${response.status}).`,
    )
  }

  const raw = await readCappedBody(response)
  return readToolResult(parseRpcBody(raw, response.headers.get("content-type")), token)
}

function isRedirect(response: Response): boolean {
  return (response.status >= 300 && response.status < 400) || response.type === "opaqueredirect"
}

/**
 * Read at most MAX_RESPONSE_BYTES and fail rather than truncate: a silently cut JSON
 * body would surface as "malformed response", which sends the next reader hunting for a
 * parser bug instead of an oversized upstream.
 */
async function readCappedBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw tooLarge()

  const body = response.body
  if (body === null) return ""

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value === undefined) continue
      total += value.byteLength
      // Checked per chunk, so a stream with no end is dropped on the first chunk past
      // the cap instead of being buffered to completion first.
      if (total > MAX_RESPONSE_BYTES) throw tooLarge()
      chunks.push(value)
    }
  } catch (cause) {
    void reader.cancel().catch(() => {})
    if (cause instanceof GatewayError) throw cause
    throw transportError(cause)
  }

  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

function tooLarge(): GatewayError {
  return new GatewayError("UPSTREAM_ERROR", "The upstream server returned an oversized response.")
}

/** The endpoint comes from stored connection config, but it is still validated. */
function endpointFor(baseUrl: string): URL {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new GatewayError("UPSTREAM_ERROR", "This connection has an invalid endpoint URL.")
  }
  const isLoopback = LOOPBACK_HOSTS.has(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new GatewayError("UPSTREAM_ERROR", "The upstream server must be reached over HTTPS.")
  }
  return url
}

function transportError(cause: unknown): GatewayError {
  const name = cause instanceof Error ? cause.name : ""
  if (name === "AbortError") return new GatewayError("CANCELLED", "The upstream call was cancelled.")
  if (name === "TimeoutError") return new GatewayError("TIMEOUT", "The upstream call timed out.")
  // The raw network error is dropped: it can carry the request headers.
  return new GatewayError("UPSTREAM_ERROR", "The upstream server is unreachable.")
}
