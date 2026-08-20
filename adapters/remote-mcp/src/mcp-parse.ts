/**
 * The parsing half of the MCP client: an untrusted response body in, a tool payload out.
 *
 * Everything here is a trust boundary — an adapter response is caller-controlled data,
 * so nothing is read without a guard first.
 */
import { GatewayError } from "@cg/core"
import { redact } from "./redact"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Streamable HTTP servers may answer a single request with an SSE frame instead of
 * plain JSON, so both are accepted.
 * ponytail: only the last `data:` line is read — enough for one-shot tools/call.
 * Upgrade path is a real event-stream reader once we need progress notifications.
 */
export function parseRpcBody(raw: string, contentType: string | null, expectedId?: string | number): unknown {
  const text = contentType?.toLowerCase().includes("text/event-stream") ? matchingSseData(raw, expectedId) : raw.trim()
  if (text.length === 0) {
    throw new GatewayError("UPSTREAM_ERROR", "The upstream server returned an empty response.")
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (expectedId !== undefined && (!isRecord(parsed) || parsed["id"] !== expectedId)) {
      throw new GatewayError("UPSTREAM_ERROR", "The upstream server returned a response for a different request.")
    }
    return parsed
  } catch (cause) {
    if (cause instanceof GatewayError) throw cause
    throw new GatewayError("UPSTREAM_ERROR", "The upstream server returned a malformed response.")
  }
}

function matchingSseData(raw: string, expectedId?: string | number): string {
  const payloads: string[] = []
  let data: string[] = []
  const flush = () => {
    if (data.length > 0) payloads.push(data.join("\n"))
    data = []
  }
  for (const line of raw.split(/\r?\n/)) {
    if (line === "") { flush(); continue }
    if (line.startsWith("data:")) data.push(line.slice("data:".length).replace(/^ /, ""))
  }
  flush()
  if (expectedId === undefined) return payloads.at(-1) ?? ""
  for (const payload of payloads) {
    try {
      const parsed: unknown = JSON.parse(payload)
      if (isRecord(parsed) && parsed["id"] === expectedId) return payload
    } catch { /* malformed events are ignored until no matching response remains */ }
  }
  return ""
}

/**
 * Read a JSON-RPC 2.0 response envelope. `token` is passed only so the upstream
 * message can be scrubbed of it — it is never read for anything else.
 */
export function readToolResult(envelope: unknown, token: string): unknown {
  if (!isRecord(envelope)) {
    throw new GatewayError("UPSTREAM_ERROR", "The upstream server returned a malformed response.")
  }
  if (isRecord(envelope["error"])) {
    throw jsonRpcError(envelope["error"], token)
  }
  const result = envelope["result"]
  if (!isRecord(result)) {
    throw new GatewayError("UPSTREAM_ERROR", "The upstream server returned no result.")
  }
  const text = firstText(result["content"])
  if (result["isError"] === true) {
    throw upstreamError(text, token)
  }
  const structured = result["structuredContent"]
  if (isRecord(structured)) return structured
  if (text === undefined) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function firstText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (isRecord(block) && block["type"] === "text" && typeof block["text"] === "string") {
      return block["text"]
    }
  }
  return undefined
}

/**
 * An upstream JSON-RPC error, kept apart by what the caller can DO about it.
 *
 * `-32003` is insufficient_scope: the credential is valid and simply is not
 * allowed to perform this action. The upstream also names the scope it wanted
 * in `data.required_scope`, which is the one fact that makes the failure
 * recoverable — re-authorize for that scope and the call works. Folding it
 * into UPSTREAM_ERROR discards that and returns a 502, which reads as "the
 * other server is broken, try again" for something retrying cannot fix.
 */
const INSUFFICIENT_SCOPE_CODE = -32003

function jsonRpcError(error: Record<string, unknown>, token: string): GatewayError {
  const message = error["message"]
  const safe = typeof message === "string" ? redact(message, token) : ""

  if (error["code"] === INSUFFICIENT_SCOPE_CODE) {
    const data = isRecord(error["data"]) ? error["data"] : {}
    const required = data["required_scope"]
    const scope = typeof required === "string" ? required : ""
    return new GatewayError(
      "INSUFFICIENT_SCOPE",
      scope.length > 0
        ? `This connection is not authorized for "${scope}". Reconnect and grant it to continue.`
        : "This connection is not authorized for that action. Reconnect with wider access to continue.",
    )
  }

  return upstreamError(safe, token)
}

function upstreamError(message: unknown, token: string): GatewayError {
  const safe = typeof message === "string" ? redact(message, token) : ""
  return new GatewayError(
    "UPSTREAM_ERROR",
    safe.length > 0
      ? `The upstream server rejected the call: ${safe}`
      : "The upstream server rejected the call.",
  )
}
