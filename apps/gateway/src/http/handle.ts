/**
 * The HTTP entry point, kept free of Bun.serve so it can be driven from a test
 * with a plain `Request`. Route matching, request scope and the last-resort
 * error boundary live here; the handlers do the work.
 */
import { createRequestScope, REQUEST_ID_HEADER } from "../context"
import type { GatewayDeps } from "../deps"
import { errorResponse, errorResponseFor } from "./respond"
import { matchRoute } from "./routes"

/** Liveness probes must never be throttled — a load balancer polls them. */
const HEALTH_PATH = "/healthz"

export async function handleHttp(
  deps: GatewayDeps,
  request: Request,
  clientKey: string,
): Promise<Response> {
  const scope = createRequestScope(deps.logger, request.headers)

  let pathname: string
  try {
    pathname = new URL(request.url).pathname
  } catch {
    return errorResponse("INVALID_INPUT", "Malformed request URL.")
  }

  const match = matchRoute(request.method, pathname)
  if (!match) return withRequestId(errorResponse("ACTION_NOT_FOUND", "Not found."), scope.requestId)
  if ("methodMismatch" in match) {
    return withRequestId(errorResponse("INVALID_INPUT", "Method not allowed."), scope.requestId)
  }

  // docs/03 "Apply rate limits". Every authenticated route runs a PBKDF2 round
  // BEFORE it knows whether the bearer token is real, so an anonymous caller can
  // otherwise buy ~28ms of gateway CPU and one control-plane query per request.
  // The pairing routes carry their own, much tighter limiter on top of this one.
  if (pathname !== HEALTH_PATH && !deps.edgeLimiter.check(clientKey)) {
    return withRequestId(
      errorResponse("RATE_LIMITED", "Too many requests. Try again shortly."),
      scope.requestId,
    )
  }

  try {
    const response = await match.handler({ request, scope, deps, params: match.params, clientKey })
    return withRequestId(response, scope.requestId)
  } catch (cause) {
    // Last resort: a handler bug must not leak a stack trace to an AI client.
    scope.logger.error("unhandled request failure", { pathname })
    return withRequestId(errorResponseFor(cause), scope.requestId)
  }
}

/** Lets a caller correlate its request with the audit row (docs/10 "Tracing"). */
function withRequestId(response: Response, requestId: string): Response {
  try {
    response.headers.set(REQUEST_ID_HEADER, requestId)
  } catch {
    // An immutable headers guard is not worth failing a response over.
  }
  return response
}
