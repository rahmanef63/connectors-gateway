/**
 * The gateway, mounted on Next.js (docs/20-vercel-template.md).
 *
 * SERVER ONLY. Never import this from a client component: it reads the
 * deployment's secrets from plain (non-`NEXT_PUBLIC_`) env vars, which Next
 * would refuse to bundle — but the intent is worth stating, and it matches how
 * `lib/credentials.ts` says the same thing.
 *
 * WHAT THIS IS. A host adapter, and nothing else. The route files under
 * `app/mcp`, `app/oauth/{register,token}`, `app/v1/**` and `app/.well-known/**`
 * exist only so Next has a file for each path; every one of them calls
 * `gatewayFetch` and the shared `handleHttp` decides what happens. There is no
 * second route table, no second authentication path, and no per-host branch
 * inside the pipeline — a Vercel deploy and the Bun edge answer identically
 * because they are the same code.
 *
 * WHAT IT CANNOT DO. It never owns a device WebSocket (`relay: false`). A
 * serverless function is frozen between invocations, so a socket it accepted
 * would be dead while Convex still listed this instance as the route to that
 * device. Local connectors therefore resolve, appear in the catalog, and fail
 * at execution with DEVICE_OFFLINE — which is the truth for this host. Reaching
 * local software needs apps/gateway deployed somewhere that can hold a socket
 * open; docs/20 has the two-surface layout.
 *
 * The app is built once per lambda instance and reused across invocations, so
 * the Ed25519 import and the Convex client survive a warm start.
 */
import { createApp, handleHttp, loadConfigWithSecrets } from "@cg/gateway/edge"
import type { GatewayApp } from "@cg/gateway/edge"

/**
 * This deployment's own public origin, as the gateway config wants it.
 *
 * `GATEWAY_PUBLIC_URL` first, because a custom domain is the only thing the
 * platform cannot tell us: `VERCEL_PROJECT_PRODUCTION_URL` names the
 * `*.vercel.app` host even when the project serves `gateway.example.com`, and
 * the value here is embedded verbatim in every OAuth discovery document. A
 * client that fetched `.well-known` from your domain and read a `.vercel.app`
 * issuer would refuse the mismatch — correctly.
 *
 * Never the `Host` header, on any host. Behind a proxy that header is
 * attacker-influenced, and an issuer taken from it walks a client to someone
 * else's token endpoint with its authorization code.
 */
function publicOrigin(): string {
  const explicit = (process.env.GATEWAY_PUBLIC_URL ?? "").trim()
  if (explicit.length > 0) return explicit

  const appOrigin = (process.env.APP_ORIGIN ?? "").trim()
  if (appOrigin.length > 0) return appOrigin

  const production = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim()
  if (production.length > 0) return `https://${production}`

  // Preview deployments only: each one has its own hostname, and a preview is
  // not something a real AI client connects to.
  const preview = (process.env.VERCEL_URL ?? "").trim()
  if (preview.length > 0) return `https://${preview}`

  return "http://localhost:3000"
}

/**
 * `handleHttp` needs a rate-limit key per peer. On Bun that is
 * `server.requestIP()`; here the platform's forwarding header is the only
 * source. It is client-controllable in principle, which is exactly why it is
 * used for NOTHING but the limiter bucket — never for identity, never for a
 * redirect URI, never in an audit row's authorization decision.
 *
 * `x-real-ip` first (Vercel sets it to the true peer), then the leftmost
 * `x-forwarded-for` entry.
 */
function clientKeyFor(request: Request): string {
  const real = request.headers.get("x-real-ip")
  if (real && real.length > 0) return real
  const forwarded = request.headers.get("x-forwarded-for")
  const first = forwarded?.split(",")[0]?.trim()
  return first && first.length > 0 ? first : "unknown"
}

let cached: Promise<GatewayApp> | null = null

function app(): Promise<GatewayApp> {
  cached ??= (async () => {
    const config = await loadConfigWithSecrets({
      ...process.env,
      // The dashboard and the gateway are one origin on this host, so the
      // pairing redirect and the OAuth authorization endpoint both point back
      // here. On the split (Bun) deployment these are two different hosts and
      // both come from the environment; nothing downstream knows the difference.
      GATEWAY_PUBLIC_URL: publicOrigin(),
      WEB_PUBLIC_URL: (process.env.WEB_PUBLIC_URL ?? "").trim() || publicOrigin(),
      CONVEX_URL: (process.env.CONVEX_URL ?? "").trim() || (process.env.NEXT_PUBLIC_CONVEX_URL ?? ""),
    })
    return createApp(config, { relay: false })
  })().catch((cause) => {
    // A failed boot must not be cached as a permanently broken instance: a
    // missing env var is fixed by a redeploy, but a transient Convex import
    // failure should not outlive the invocation that saw it.
    cached = null
    throw cause
  })
  return cached
}

/**
 * Serve one gateway request. Every route file in this app is a one-line call to
 * this function; the URL it was reached at is what selects the handler.
 *
 * `canonicalPath` exists for exactly one case: the three `/.well-known/…`
 * documents. Next's file-system router does not serve a dot-prefixed segment,
 * so those paths arrive through a `next.config.mjs` rewrite — and after a
 * rewrite `request.url` carries the DESTINATION path, which the gateway's route
 * table has never heard of. Passing the canonical path restores the one thing
 * the rewrite destroyed, without giving the well-known documents a second
 * implementation. It is a constant in the calling route file, never anything
 * read off the request.
 */
export async function gatewayFetch(request: Request, canonicalPath?: string): Promise<Response> {
  const gateway = await app()
  const routed = canonicalPath === undefined ? request : retarget(request, canonicalPath)
  return handleHttp(gateway.deps, routed, clientKeyFor(request))
}

/**
 * Same method and headers, a different pathname.
 *
 * The body is deliberately dropped rather than forwarded: the only callers are
 * the three `/.well-known` documents, which are GET and OPTIONS, and rebuilding
 * a request FROM a request would carry a `ReadableStream` body that undici then
 * refuses without `duplex: "half"`. Nothing that needs a body is ever retargeted
 * — those routes are reached at their real paths and never go through here.
 */
function retarget(request: Request, pathname: string): Request {
  const url = new URL(request.url)
  url.pathname = pathname
  return new Request(url, { method: request.method, headers: request.headers })
}

/*
 * Route segment config (`runtime`, `dynamic`) is repeated as literals in every
 * route file rather than shared from here. That is not an oversight: Next reads
 * those exports by static analysis at build time and does not follow a member
 * access into another module, so a shared constant would silently produce an
 * Edge-runtime, statically-rendered route — which fails at the first `node:fs`
 * call, in production only.
 */
