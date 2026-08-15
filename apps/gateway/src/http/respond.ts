/**
 * Response shaping. One error envelope for the whole edge:
 * `{error: {code, message}}` with the status from `httpStatusFor`.
 */
import { GatewayError, httpStatusFor, toGatewayError } from "@cg/core"
import type { ErrorCode, ExecutionResult } from "@cg/core"

const BASE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  // Connector results are per-user and often single-use: never cacheable.
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
})

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } })
}

export function errorResponse(code: ErrorCode, message: string): Response {
  return jsonResponse({ error: { code, message } }, httpStatusFor(code))
}

/** Any throwable becomes a safe, coded envelope — never a stack or raw message. */
export function errorResponseFor(cause: unknown): Response {
  const error: GatewayError = toGatewayError(cause)
  return errorResponse(error.code, error.message)
}

/** REST shape for a completed execution. Errors keep the same envelope as any other failure. */
export function executionResponse(result: ExecutionResult): Response {
  if (result.status === "error") {
    const error = result.error ?? { code: "INTERNAL" as ErrorCode, message: "The action failed." }
    return errorResponse(error.code, error.message)
  }
  return jsonResponse({
    status: "success",
    output: result.output ?? null,
    files: result.files ?? [],
    timingMs: Math.round(result.timingMs),
  })
}
