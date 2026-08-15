/**
 * ONE Bun process serving HTTP (MCP + REST) and the device-relay WebSocket, so
 * dispatching a job to a paired device is an in-process function call rather
 * than a queue hop (docs/01, docs/12 "The relay can initially share the
 * gateway origin").
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

function shutdown(signal: string): void {
  app.logger.info("shutting down", { signal })
  app.stop()
  void server.stop()
  process.exit(0)
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))
