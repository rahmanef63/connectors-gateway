/**
 * Shared device -> gateway route ownership for horizontally-scaled relays.
 *
 * Job payloads NEVER enter Convex. This table stores only short-lived routing
 * metadata so any gateway can find the task that owns a device WebSocket.
 */
import { PRESENCE_TTL_MS } from "@cg/core"
import { v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { mutation, query } from "../_generated/server"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { requireService } from "../_shared/auth"
import { fail } from "../_shared/errors"
import { assertIdentifier } from "../_shared/input"
import { deviceByExternalId } from "../_shared/lookup"

const routeValidator = v.object({
  gatewayId: v.string(),
  sessionId: v.string(),
  internalUrl: v.string(),
  expiresAt: v.number(),
})

const boolValidator = v.object({ ok: v.boolean() })
const MAX_ROUTE_ROWS = 2

export const claim = mutation({
  args: {
    serviceToken: v.string(),
    deviceId: v.string(),
    gatewayId: v.string(),
    sessionId: v.string(),
    internalUrl: v.string(),
  },
  returns: boolValidator,
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    requireService(ctx, args.serviceToken)
    const deviceId = assertIdentifier(args.deviceId, "deviceId")
    const gatewayId = assertGatewayId(args.gatewayId)
    const sessionId = assertSessionId(args.sessionId)
    const internalUrl = assertInternalRelayUrl(args.internalUrl)
    const device = await deviceByExternalId(ctx, deviceId)
    if (device === null || device.status === "revoked") return { ok: false }

    const rows = await routesFor(ctx, deviceId)
    if (rows.length > 1) fail("INTERNAL", "Relay route state is inconsistent.")
    const now = Date.now()
    const expiresAt = now + PRESENCE_TTL_MS
    const current = rows[0]
    if (current === undefined) {
      await ctx.db.insert("relayRoutes", {
        deviceId,
        gatewayId,
        sessionId,
        internalUrl,
        updatedAt: now,
        expiresAt,
      })
    } else {
      // A reconnect always wins. The previous owner discovers the mismatch on
      // its next refresh and closes only its stale socket.
      await ctx.db.patch(current._id, { gatewayId, sessionId, internalUrl, updatedAt: now, expiresAt })
    }
    return { ok: true }
  },
})

export const refresh = mutation({
  args: {
    serviceToken: v.string(),
    deviceId: v.string(),
    gatewayId: v.string(),
    sessionId: v.string(),
  },
  returns: boolValidator,
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    requireService(ctx, args.serviceToken)
    const deviceId = assertIdentifier(args.deviceId, "deviceId")
    const gatewayId = assertGatewayId(args.gatewayId)
    const sessionId = assertSessionId(args.sessionId)
    const rows = await routesFor(ctx, deviceId)
    if (rows.length > 1) fail("INTERNAL", "Relay route state is inconsistent.")
    const current = rows[0]
    const now = Date.now()
    if (
      current === undefined ||
      current.gatewayId !== gatewayId ||
      current.sessionId !== sessionId ||
      current.expiresAt <= now
    ) return { ok: false }
    await ctx.db.patch(current._id, { updatedAt: now, expiresAt: now + PRESENCE_TTL_MS })
    return { ok: true }
  },
})

export const release = mutation({
  args: {
    serviceToken: v.string(),
    deviceId: v.string(),
    gatewayId: v.string(),
    sessionId: v.string(),
  },
  returns: boolValidator,
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    requireService(ctx, args.serviceToken)
    const deviceId = assertIdentifier(args.deviceId, "deviceId")
    const gatewayId = assertGatewayId(args.gatewayId)
    const sessionId = assertSessionId(args.sessionId)
    const rows = await routesFor(ctx, deviceId)
    if (rows.length > 1) fail("INTERNAL", "Relay route state is inconsistent.")
    const current = rows[0]
    if (current === undefined || current.gatewayId !== gatewayId || current.sessionId !== sessionId) {
      return { ok: false }
    }
    await ctx.db.delete(current._id)
    return { ok: true }
  },
})

export const resolve = query({
  args: { serviceToken: v.string(), deviceId: v.string() },
  returns: v.union(routeValidator, v.null()),
  handler: async (ctx, args) => {
    requireService(ctx, args.serviceToken)
    const deviceId = assertIdentifier(args.deviceId, "deviceId")
    const rows = await routesFor(ctx, deviceId)
    if (rows.length > 1) fail("INTERNAL", "Relay route state is inconsistent.")
    const current = rows[0]
    if (current === undefined || current.expiresAt <= Date.now()) return null
    return {
      gatewayId: current.gatewayId,
      sessionId: current.sessionId,
      internalUrl: current.internalUrl,
      expiresAt: current.expiresAt,
    }
  },
})

async function routesFor(
  ctx: QueryCtx | MutationCtx,
  deviceId: string,
): Promise<Doc<"relayRoutes">[]> {
  return await ctx.db
    .query("relayRoutes")
    .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
    .take(MAX_ROUTE_ROWS)
}

function assertGatewayId(value: string): string {
  if (!/^gw_[A-Za-z0-9_-]{16,96}$/.test(value)) fail("INVALID_INPUT", "Gateway id is invalid.")
  return value
}

function assertSessionId(value: string): string {
  if (!/^nce_[A-Za-z0-9_-]{16,96}$/.test(value)) fail("INVALID_INPUT", "Relay session id is invalid.")
  return value
}

function assertInternalRelayUrl(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch { fail("INVALID_INPUT", "Internal relay URL is invalid.") }
  if (
    url.protocol !== "http:" || url.username !== "" || url.password !== "" ||
    url.search !== "" || url.hash !== "" || (url.pathname !== "/" && url.pathname !== "") ||
    (url.port !== "" && url.port !== "8787") || !isPrivateOrLoopbackIpv4(url.hostname)
  ) fail("INVALID_INPUT", "Internal relay URL is invalid.")
  return `http://${url.hostname}:${url.port || "8787"}`
}

function isPrivateOrLoopbackIpv4(host: string): boolean {
  const parts = host.split(".").map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts as [number, number, number, number]
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}
