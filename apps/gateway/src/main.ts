/**
 * Horizontally-safe Bun edge: every replica may serve HTTP and own device
 * WebSockets. Convex coordinates socket ownership; peer jobs are encrypted over
 * the private Docker overlay and shared rate buckets preserve global budgets.
 */
import { createApp } from "./app"
import { loadConfigWithSecrets } from "./config"
import { handleHttp } from "./http/handle"

export const DEVICE_PATH = "/device"
export const INTERNAL_RELAY_PATH = "/internal/relay/dispatch"

const config = await loadConfigWithSecrets()
// This process IS the long-lived edge, so it owns the relay. The serverless
// mount in apps/web passes `{ relay: false }` instead.
const app = await createApp(config, { relay: true })
const relay = app.relay
if (relay === null) throw new Error("The Bun edge requires a relay.")

const server = Bun.serve({
  port: config.port,
  idleTimeout: 60,

  async fetch(request, bunServer) {
    const url = new URL(request.url)
    if (url.pathname === INTERNAL_RELAY_PATH) {
      if (request.method !== "POST") return new Response("Method not allowed.", { status: 405 })
      return app.handlePeerDispatch(request)
    }

    const clientKey = bunServer.requestIP(request)?.address ?? "unknown"
    if (url.pathname === DEVICE_PATH) {
      if (!await app.deps.edgeLimiter.check(`ws:${clientKey}`)) {
        return new Response("Too many requests.", { status: 429 })
      }
      const upgraded = bunServer.upgrade(request, { data: relay.newState() })
      if (upgraded) return undefined
      return new Response("Expected a WebSocket upgrade.", { status: 426 })
    }
    return handleHttp(app.deps, request, clientKey)
  },

  websocket: relay.websocket,
})

app.logger.info("gateway listening", {
  port: server.port,
  env: config.env,
  gatewayId: app.gatewayId,
  connectors: app.deps.registry.list().length,
})

let terminating = false
async function terminate(reason: string, exitCode: number): Promise<void> {
  if (terminating) return
  terminating = true
  app.logger.info("gateway process stopping", { reason, exitCode })
  try { await server.stop(true) } catch { app.logger.warn("gateway server close failed") }
  try { await app.stop() } catch { app.logger.warn("gateway resource cleanup failed") }
  process.exit(exitCode)
}
process.on("SIGINT", () => void terminate("SIGINT", 0))
process.on("SIGTERM", () => void terminate("SIGTERM", 0))
