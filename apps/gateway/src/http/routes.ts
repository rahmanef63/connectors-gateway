/**
 * The route table. Every public entry point is listed here exactly once, with
 * its authentication requirement stated in the table rather than buried in a
 * handler — a route that is not in this file does not exist.
 */
import type { RequestScope } from "../context"
import type { GatewayDeps } from "../deps"
import { handleActionRoute } from "./handlers/actions"
import { handleCatalog } from "./handlers/catalog"
import { handleHealthz } from "./handlers/healthz"
import { handleDiagnostics } from "./handlers/diagnostics"
import { handleMcp } from "./handlers/mcp"
import { handleOAuthRegister, handleOAuthToken } from "./handlers/oauth"
import { handlePairClaim } from "./handlers/pair-claim"
import { handlePairStart } from "./handlers/pair-start"
import {
  handleAuthorizationServer,
  handleMetadataPreflight,
  handleProtectedResource,
} from "./handlers/well-known"

export type RouteContext = {
  request: Request
  scope: RequestScope
  deps: GatewayDeps
  params: Record<string, string>
  /** Transport-level peer address; used for rate limiting only. */
  clientKey: string
}

export type RouteHandler = (context: RouteContext) => Promise<Response>

export type Route = {
  method: string
  /** Segments; `:name` captures. */
  pattern: string
  handler: RouteHandler
}

/** RFC 9728 §3.1: a resource with a path is also discoverable at that path. */
const PRM = "/.well-known/oauth-protected-resource"
const ASM = "/.well-known/oauth-authorization-server"

export const ROUTES: readonly Route[] = Object.freeze([
  { method: "GET", pattern: "/healthz", handler: handleHealthz },
  { method: "GET", pattern: "/internal/diagnostics", handler: handleDiagnostics },
  { method: "POST", pattern: "/mcp", handler: handleMcp },

  // Public, unauthenticated discovery. Listed before the authenticated routes
  // because that is the order a client actually calls them in.
  { method: "GET", pattern: PRM, handler: handleProtectedResource },
  { method: "GET", pattern: `${PRM}/mcp`, handler: handleProtectedResource },
  { method: "GET", pattern: ASM, handler: handleAuthorizationServer },
  { method: "OPTIONS", pattern: PRM, handler: handleMetadataPreflight },
  { method: "OPTIONS", pattern: `${PRM}/mcp`, handler: handleMetadataPreflight },
  { method: "OPTIONS", pattern: ASM, handler: handleMetadataPreflight },

  // Unauthenticated by protocol: a client reaches these BEFORE it holds any
  // credential. Both carry their own tighter limiter (see deps.oauthLimiter).
  { method: "POST", pattern: "/oauth/register", handler: handleOAuthRegister },
  { method: "POST", pattern: "/oauth/token", handler: handleOAuthToken },

  { method: "GET", pattern: "/v1/catalog", handler: handleCatalog },
  { method: "POST", pattern: "/v1/actions/:connector/:action", handler: handleActionRoute },
  { method: "POST", pattern: "/v1/pair/start", handler: handlePairStart },
  { method: "POST", pattern: "/v1/pair/claim", handler: handlePairClaim },
])

export type RouteMatch = { handler: RouteHandler; params: Record<string, string> }

function segments(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0)
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const expected = segments(pattern)
  const actual = segments(path)
  if (expected.length !== actual.length) return null

  const params: Record<string, string> = {}
  for (let index = 0; index < expected.length; index += 1) {
    const slot = expected[index]
    const value = actual[index]
    if (slot === undefined || value === undefined) return null
    if (slot.startsWith(":")) {
      params[slot.slice(1)] = decodeURIComponent(value)
      continue
    }
    if (slot !== value) return null
  }
  return params
}

/** Returns null for no path match; `methodMismatch` for a wrong verb (405). */
export function matchRoute(
  method: string,
  path: string,
): RouteMatch | { methodMismatch: true } | null {
  let pathMatched = false
  for (const route of ROUTES) {
    const params = matchPattern(route.pattern, path)
    if (!params) continue
    pathMatched = true
    if (route.method === method) return { handler: route.handler, params }
  }
  return pathMatched ? { methodMismatch: true } : null
}
