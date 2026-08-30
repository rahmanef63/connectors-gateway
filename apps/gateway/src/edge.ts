/**
 * The gateway's host-agnostic surface (docs/20-vercel-template.md).
 *
 * Everything exported here runs on Bun and on Node 22 alike: Web `Request` /
 * `Response`, WebCrypto, `fetch`. `main.ts` — the only module that touches
 * `Bun.serve` — is deliberately NOT re-exported, so importing this file can
 * never drag a Bun global into a Next.js build.
 *
 * The point of the seam is that both hosts serve the SAME edge. `handleHttp`,
 * the route table, the pipeline, the policy check and the audit write are one
 * implementation; a host contributes only two things it alone knows — the
 * client's peer address (for the rate-limit key) and whether it may own a
 * WebSocket. Nothing about authentication or authorization is per-host, because
 * a second implementation of those is a second thing to get wrong.
 */
export { createApp } from "./app"
export type { CreateAppOptions, GatewayApp } from "./app"
export { loadConfig, loadConfigWithSecrets } from "./config"
export type { EnvSource, GatewayConfig, GatewayEnv } from "./config"
export { handleHttp } from "./http/handle"
export type { GatewayDeps } from "./deps"
export { ROUTES, matchRoute } from "./http/routes"
