/**
 * GET /.well-known/oauth-protected-resource/mcp — RFC 9728 s3.1: a resource with a path is also discoverable at that path.
 *
 * Reached through a rewrite in next.config.mjs: Next's file-system router does
 * not serve a dot-prefixed segment, so the folder here is `well-known` and the
 * canonical path is restored on the way into the gateway. Public,
 * unauthenticated and CORS-enabled by definition — every MCP client fetches
 * this before it holds any credential.
 */
import { gatewayFetch } from "@/lib/gateway/runtime"

// Literals, not a shared constant: Next reads route segment config by static
// analysis at build time, and it does not follow a member access into another
// module. `nodejs` because the pipeline reads the bundled skill file with
// node:fs; `force-dynamic` because every response here depends on a bearer
// token or on live control-plane state.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CANONICAL_PATH = "/.well-known/oauth-protected-resource/mcp"

export function GET(request: Request): Promise<Response> {
  return gatewayFetch(request, CANONICAL_PATH)
}

export function OPTIONS(request: Request): Promise<Response> {
  return gatewayFetch(request, CANONICAL_PATH)
}
