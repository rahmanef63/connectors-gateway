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
 * Everything a signed-out visitor must not reach. The screens come from the nav
 * registry itself — restating them here is how a newly added screen ends up
 * ungated. `/` and `/pair` are not registry entries (one redirects, the other is
 * reached from a link the agent prints), so they are named.
 */
const isProtectedRoute = createRouteMatcher(["/", ...NAV_ROUTE_PATTERNS, "/pair(.*)"])

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
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
