/**
 * MCP 2026-07-28 request metadata and HTTP header validation.
 *
 * The modern transport deliberately lives beside the legacy dispatcher rather
 * than replacing it: ChatGPT/Claude clients still in the initialize-based
 * revisions keep working, while newer clients get the stateless protocol.
 */
import type { JsonRpcRequest } from "./jsonrpc"

export const MCP_MODERN_PROTOCOL_VERSION = "2026-07-28" as const

export const MCP_META_KEYS = Object.freeze({
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  clientInfo: "io.modelcontextprotocol/clientInfo",
  clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
  serverInfo: "io.modelcontextprotocol/serverInfo",
})

export const MCP_PROTOCOL_ERRORS = Object.freeze({
  HEADER_MISMATCH: -32020,
  MISSING_REQUIRED_CLIENT_CAPABILITY: -32021,
  UNSUPPORTED_PROTOCOL_VERSION: -32022,
})

export type McpTransportHeaders = {
  protocolVersion: string | null
  method: string | null
  name: string | null
}

export class McpProtocolError extends Error {
  readonly code: number
  readonly status: number
  readonly data?: unknown

  constructor(code: number, status: number, message: string, data?: unknown) {
    super(message)
    this.name = "McpProtocolError"
    this.code = code
    this.status = status
    this.data = data
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requestMeta(request: JsonRpcRequest): Record<string, unknown> | null {
  return isRecord(request.params._meta) ? request.params._meta : null
}

function requestProtocolVersion(request: JsonRpcRequest): unknown {
  return requestMeta(request)?.[MCP_META_KEYS.protocolVersion]
}

/**
 * A 2025-06-18 client may already send MCP-Protocol-Version, so that header by
 * itself does not opt into the stateless revision. The modern body metadata,
 * modern routing headers, exact version, or server/discover do.
 */
export function isModernMcpRequest(
  request: JsonRpcRequest,
  headers: McpTransportHeaders,
): boolean {
  return (
    request.method === "server/discover" ||
    requestProtocolVersion(request) !== undefined ||
    headers.protocolVersion === MCP_MODERN_PROTOCOL_VERSION ||
    headers.method !== null ||
    headers.name !== null
  )
}

function decodeHeaderValue(value: string): string {
  const prefix = "=?base64?"
  const suffix = "?="
  if (!value.startsWith(prefix) || !value.endsWith(suffix)) return value

  const payload = value.slice(prefix.length, -suffix.length)
  if (
    payload.length === 0 ||
    payload.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)
  ) {
    throw new Error("Malformed Base64 sentinel.")
  }

  try {
    const binary = atob(payload)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error("Malformed Base64 sentinel.")
  }
}

function headerMismatch(message: string): never {
  throw new McpProtocolError(MCP_PROTOCOL_ERRORS.HEADER_MISMATCH, 400, message)
}

function expectedName(request: JsonRpcRequest): unknown {
  if (request.method === "tools/call" || request.method === "prompts/get") {
    return request.params.name
  }
  if (request.method === "resources/read") return request.params.uri
  return undefined
}

/** Validate every duplicated source of truth before the dispatcher sees it. */
export function validateModernMcpRequest(
  request: JsonRpcRequest,
  headers: McpTransportHeaders,
): void {
  const meta = requestMeta(request)
  if (meta === null) {
    throw new McpProtocolError(-32602, 400, "Modern MCP requests require a _meta object.")
  }

  const bodyVersion = meta[MCP_META_KEYS.protocolVersion]
  if (typeof bodyVersion !== "string" || bodyVersion.length === 0) {
    throw new McpProtocolError(-32602, 400, "Modern MCP requests require protocolVersion metadata.")
  }

  if (headers.protocolVersion === null || headers.protocolVersion !== bodyVersion) {
    headerMismatch("MCP-Protocol-Version does not match the request body.")
  }

  if (bodyVersion !== MCP_MODERN_PROTOCOL_VERSION) {
    throw new McpProtocolError(
      MCP_PROTOCOL_ERRORS.UNSUPPORTED_PROTOCOL_VERSION,
      400,
      "Unsupported MCP protocol version.",
      { supported: [MCP_MODERN_PROTOCOL_VERSION], requested: bodyVersion },
    )
  }

  if (headers.method === null || headers.method !== request.method) {
    headerMismatch("Mcp-Method does not match the request body.")
  }

  const clientCapabilities = meta[MCP_META_KEYS.clientCapabilities]
  if (!isRecord(clientCapabilities)) {
    throw new McpProtocolError(
      -32602,
      400,
      "Modern MCP requests require clientCapabilities metadata.",
    )
  }

  const name = expectedName(request)
  if (name === undefined) return
  if (typeof name !== "string" || name.length === 0) {
    throw new McpProtocolError(-32602, 400, "This method requires a name or URI.")
  }
  if (headers.name === null) headerMismatch("Mcp-Name is required for this method.")

  let decoded: string
  try {
    decoded = decodeHeaderValue(headers.name)
  } catch {
    headerMismatch("Mcp-Name is malformed.")
  }
  if (decoded !== name) headerMismatch("Mcp-Name does not match the request body.")
}

export function serverResultMeta(serverInfo: Record<string, unknown>): Record<string, unknown> {
  return { [MCP_META_KEYS.serverInfo]: serverInfo }
}

export function completeModernResult(
  value: Record<string, unknown>,
  serverInfo: Record<string, unknown>,
): Record<string, unknown> {
  const existingMeta = isRecord(value._meta) ? value._meta : {}
  return {
    ...value,
    resultType: "complete",
    _meta: { ...existingMeta, ...serverResultMeta(serverInfo) },
  }
}
