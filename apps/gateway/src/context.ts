/**
 * Per-request identity and tracing (docs/10 "a single request id should follow").
 *
 * The request id is the only value the caller may influence, and only when it
 * matches a strict charset — an unbounded caller-supplied string would end up in
 * every log line and every audit row.
 */
import { newId } from "@cg/core"
import type { Principal, RequestContext } from "@cg/core"
import type { Logger } from "@cg/observability"

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
export const REQUEST_ID_HEADER = "x-request-id"

export type RequestScope = {
  requestId: string
  /** epoch ms */
  receivedAt: number
  logger: Logger
}

export function resolveRequestId(header: string | null | undefined): string {
  if (typeof header === "string" && REQUEST_ID_RE.test(header)) return header
  return newId("request")
}

export function createRequestScope(
  logger: Logger,
  headers: Headers,
  now: number = Date.now(),
): RequestScope {
  const requestId = resolveRequestId(headers.get(REQUEST_ID_HEADER))
  return { requestId, receivedAt: now, logger: logger.child({ requestId }) }
}

/**
 * Identity is attached here, server-side, from the authenticated principal.
 * There is deliberately no path that builds a RequestContext from a body field.
 */
export function toRequestContext(scope: RequestScope, principal: Principal): RequestContext {
  return { requestId: scope.requestId, principal, receivedAt: scope.receivedAt }
}
