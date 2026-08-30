/**
 * POST /oauth/register — RFC 7591 dynamic client registration.
 *
 * A mount point, not a handler. The gateway's own route table (apps/gateway
 * http/routes.ts) owns what this path does; this file exists because Next needs
 * a file per path. See lib/gateway/runtime.ts.
 */
import { gatewayFetch } from "@/lib/gateway/runtime"

// Literals, not a shared constant: Next reads route segment config by static
// analysis at build time, and it does not follow a member access into another
// module. `nodejs` because the pipeline reads the bundled skill file with
// node:fs; `force-dynamic` because every response here depends on a bearer
// token or on live control-plane state.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function POST(request: Request): Promise<Response> {
  return gatewayFetch(request)
}
