/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`. This is THE auth gate: a
 * layout cannot stop a nested page from rendering, so the session check has to
 * happen before routing resolves.
 *
 * It gates rendering only. Every page still preloads Convex with the caller's
 * own token, and Convex re-checks identity itself — nothing here is treated as
 * authorization (P0: authorize server-side at every entry point).
 */
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server"

import { NAV_ROUTE_PATTERNS } from "./components/shell/nav-items"
import { DEFAULT_LANDING, signInPath } from "./lib/safe-redirect"

const isSignInRoute = createRouteMatcher(["/sign-in"])

/**
 * The gateway edge (docs/20). These paths are served by
 * `apps/web/lib/gateway/runtime.ts`, and they must reach it UNTOUCHED.
 *
 * They are machine-to-machine: an AI client calling `/oauth/register` or
 * `/oauth/token` holds no session and by protocol cannot have one — those two
 * endpoints are how it gets a credential in the first place. Redirecting them to
 * a sign-in page does not fail loudly; it answers a JSON-RPC caller with HTML,
 * and the client reports the server as not supporting OAuth at all. The
 * `/.well-known` documents have the same property, and `/mcp` authenticates
 * itself with a bearer token that a cookie session knows nothing about.
 *
 * Checked BEFORE `isAuthenticated()`, so these requests do not pay for a session
 * lookup they will never use.
 *
 * NOTE the deliberate asymmetry inside `/oauth`: `authorize` and `callback` are
 * the two halves that need a HUMAN and stay gated below. `register` and `token`
 * are the two that need a machine and are listed here. Adding a `/oauth/*`
 * route means deciding which of those it is.
 */
const isGatewayRoute = createRouteMatcher([
  "/mcp",
  "/healthz",
  "/v1/(.*)",
  "/internal/(.*)",
  "/oauth/register",
  "/oauth/token",
  // The real path, and the rewrite destination Next serves it from
  // (next.config.mjs) — middleware runs before an afterFiles rewrite, but
  // matching both keeps this correct if that ordering ever changes.
  "/.well-known/(.*)",
  "/well-known/(.*)",
])

/**
 * Everything a signed-out visitor must not reach. The screens come from the nav
 * registry itself — restating them here is how a newly added screen ends up
 * ungated. `/` and `/pair` are not registry entries (one redirects, the other is
 * reached from a link the agent prints), so they are named.
 */
const isProtectedRoute = createRouteMatcher([
  "/",
  ...NAV_ROUTE_PATTERNS,
  "/pair(.*)",
  // The OAuth screens that need a human. The callback writes a connection as
  // the signed-in user, so a session that lapsed mid-consent must land on
  // sign-in and come BACK with the code intact (`signInPath` keeps the query
  // string) rather than silently dropping a credential the user just approved.
  //
  // Named individually rather than as `/oauth(.*)`: the machine halves of the
  // OAuth flow live under the same prefix and must NOT be gated
  // (`isGatewayRoute` above).
  "/oauth/authorize(.*)",
  "/oauth/callback(.*)",
])

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  // First, and before any session work: the gateway edge answers for itself.
  if (isGatewayRoute(request)) return undefined

  const authenticated = await convexAuth.isAuthenticated()

  if (isSignInRoute(request) && authenticated) {
    return nextjsMiddlewareRedirect(request, DEFAULT_LANDING)
  }

  if (isProtectedRoute(request) && !authenticated) {
    // Carry the target through so a pairing link survives the sign-in detour.
    return nextjsMiddlewareRedirect(
      request,
      signInPath(request.nextUrl.pathname, request.nextUrl.search),
    )
  }

  return undefined
})

export const config = {
  // Skip Next internals and anything with a file extension; match everything else.
  matcher: ["/((?!_next|.*\\.[\\w]+$).*)", "/", "/(api|trpc)(.*)"],
}
