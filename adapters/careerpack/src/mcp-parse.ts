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
export function parseRpcBody(raw: string, contentType: string | null): unknown {
  const text = contentType?.toLowerCase().includes("text/event-stream") ? lastSseData(raw) : raw.trim()
  if (text.length === 0) {
    throw new GatewayError("UPSTREAM_ERROR", "CareerPack returned an empty response.")
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new GatewayError("UPSTREAM_ERROR", "CareerPack returned a malformed response.")
  }
}

function lastSseData(raw: string): string {
  const payloads: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("data:")) payloads.push(line.slice("data:".length).trim())
  }
  return payloads.at(-1) ?? ""
}

/**
 * Read a JSON-RPC 2.0 response envelope. `token` is passed only so the upstream
 * message can be scrubbed of it — it is never read for anything else.
 */
export function readToolResult(envelope: unknown, token: string): unknown {
  if (!isRecord(envelope)) {
    throw new GatewayError("UPSTREAM_ERROR", "CareerPack returned a malformed response.")
  }
  if (isRecord(envelope["error"])) {
    throw upstreamError(envelope["error"]["message"], token)
  }
  const result = envelope["result"]
  if (!isRecord(result)) {
    throw new GatewayError("UPSTREAM_ERROR", "CareerPack returned no result.")
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

function upstreamError(message: unknown, token: string): GatewayError {
  const safe = typeof message === "string" ? redact(message, token) : ""
  return new GatewayError(
    "UPSTREAM_ERROR",
    safe.length > 0 ? `CareerPack rejected the call: ${safe}` : "CareerPack rejected the call.",
  )
}
