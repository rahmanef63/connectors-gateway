/**
 * ONE Bun process serving HTTP (MCP + REST) and the device-relay WebSocket.
 *
 * That topology is enforced by a Convex singleton lease before `Bun.serve`.
 * The edge checks local lease validity on every request; loss also closes active
 * connections and exits, so process-local sockets and rate buckets can never be
 * split across two live production replicas.
 */
import { createApp } from "./app"
import { loadConfig } from "./config"
import { handleHttp } from "./http/handle"

export const DEVICE_PATH = "/device"

const config = loadConfig()
const app = await createApp(config)

const server = Bun.serve({
  port: config.port,
  idleTimeout: 60,

  fetch(request, bunServer) {
    if (!app.isPrimary()) return unavailable()

    const url = new URL(request.url)
    const clientKey = bunServer.requestIP(request)?.address ?? "unknown"
    if (url.pathname === DEVICE_PATH) {
      // Each anonymous upgrade buys a `hello` attempt, and every hello attempt
      // costs a control-plane lookup (docs/03 "Apply rate limits").
      if (!app.deps.edgeLimiter.check(`ws:${clientKey}`)) {
        return new Response("Too many requests.", { status: 429 })
      }
      // The socket starts UNAUTHENTICATED: `hello` is verified by the relay,
      // never by an upgrade-time header (docs/05).
      const upgraded = bunServer.upgrade(request, { data: app.deps.relay.newState() })
      if (upgraded) return undefined
      return new Response("Expected a WebSocket upgrade.", { status: 426 })
    }
    return handleHttp(app.deps, request, clientKey)
  },

  websocket: app.deps.relay.websocket,
})

app.logger.info("gateway listening", {
  port: server.port,
  env: config.env,
  connectors: app.deps.registry.list().length,
})

let terminating = false

async function terminate(reason: string, exitCode: number): Promise<void> {
  if (terminating) return
  terminating = true
  app.logger.info("gateway process stopping", { reason, exitCode })

  try {
    // Stop accepting traffic and close existing WebSockets before releasing a
    // voluntarily-held lease. On lease loss this also closes the stale relay.
    await server.stop(true)
  } catch {
    app.logger.warn("gateway server close failed")
  }
  try {
    await app.stop()
  } catch {
    app.logger.warn("gateway resource cleanup failed")
  }
  process.exit(exitCode)
}

void app.leaseLost.then((reason) => terminate(`lease_${reason}`, 1))
process.on("SIGINT", () => void terminate("SIGINT", 0))
process.on("SIGTERM", () => void terminate("SIGTERM", 0))

function unavailable(): Response {
  return new Response("Gateway is not the active primary.", {
    status: 503,
    headers: { "retry-after": "30" },
  })
}
