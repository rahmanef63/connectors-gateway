/** Shared device -> gateway WebSocket ownership backed by Convex. */
import { GatewayError } from "@cg/core"
import type { ControlPlaneClient } from "./client"
import { REFS } from "./refs"

export type RelayRoute = {
  gatewayId: string
  sessionId: string
  internalUrl: string
  expiresAt: number
}

export type RelayRouteStore = {
  claim(deviceId: string, gatewayId: string, sessionId: string, internalUrl: string): Promise<boolean>
  refresh(deviceId: string, gatewayId: string, sessionId: string): Promise<boolean>
  release(deviceId: string, gatewayId: string, sessionId: string): Promise<boolean>
  resolve(deviceId: string): Promise<RelayRoute | null>
}

export function createRelayRouteStore(client: ControlPlaneClient): RelayRouteStore {
  return {
    async claim(deviceId, gatewayId, sessionId, internalUrl) {
      return readOk(await client.mutation(REFS.relayRoutesClaim, { deviceId, gatewayId, sessionId, internalUrl }))
    },
    async refresh(deviceId, gatewayId, sessionId) {
      return readOk(await client.mutation(REFS.relayRoutesRefresh, { deviceId, gatewayId, sessionId }))
    },
    async release(deviceId, gatewayId, sessionId) {
      return readOk(await client.mutation(REFS.relayRoutesRelease, { deviceId, gatewayId, sessionId }))
    },
    async resolve(deviceId) {
      return readRoute(await client.query(REFS.relayRoutesResolve, { deviceId }))
    },
  }
}

function readOk(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid()
  return typeof (value as Record<string, unknown>).ok === "boolean"
    ? (value as { ok: boolean }).ok
    : (() => { throw invalid() })()
}

function readRoute(value: unknown): RelayRoute | null {
  if (value === null) return null
  if (typeof value !== "object" || Array.isArray(value)) throw invalid()
  const row = value as Record<string, unknown>
  if (
    typeof row.gatewayId !== "string" || !/^gw_[A-Za-z0-9_-]{16,96}$/.test(row.gatewayId) ||
    typeof row.sessionId !== "string" || !/^nce_[A-Za-z0-9_-]{16,96}$/.test(row.sessionId) ||
    typeof row.internalUrl !== "string" || !isPrivateRelayUrl(row.internalUrl) ||
    typeof row.expiresAt !== "number" || !Number.isFinite(row.expiresAt)
  ) throw invalid()
  return row as RelayRoute
}

export function isPrivateRelayUrl(raw: string): boolean {
  let url: URL
  try { url = new URL(raw) } catch { return false }
  if (url.protocol !== "http:" || url.username || url.password || url.search || url.hash) return false
  if ((url.pathname !== "/" && url.pathname !== "") || (url.port !== "" && url.port !== "8787")) return false
  const parts = url.hostname.split(".").map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts as [number, number, number, number]
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function invalid(): GatewayError {
  return new GatewayError("UPSTREAM_ERROR", "The control plane returned invalid relay routing state.")
}
