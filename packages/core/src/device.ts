/**
 * Control-plane records: devices, connections, policy rules.
 * Shapes follow docs/04-device-pairing.md and docs/08-auth-and-identity.md.
 */
import type { AuthType, PolicyDecision } from "./risk"

export const DEVICE_PLATFORMS = ["windows", "macos", "linux"] as const
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number]

export type DeviceStatus = "online" | "offline" | "revoked"

/**
 * How long a stored `online` stays believable without a refresh.
 *
 * `status: "online"` is written by the relay on hello and unwritten by its
 * disconnect handler — which never runs if the gateway process dies, and it
 * dies on every deploy. Left alone, every device that was connected at that
 * moment stays `online` forever: the dashboard shows phantoms and
 * `selectDevice` routes a job to a device with no socket, which then fails at
 * dispatch instead of returning a clean DEVICE_OFFLINE.
 *
 * So the stored status is a CLAIM WITH AN EXPIRY, not a fact. A reader treats a
 * device as online only while `lastSeenAt` is fresh. Enforced on read, so
 * nothing has to sweep for this to be correct — the same shape `apiKeys`
 * already uses for `expiresAt`.
 */
export const PRESENCE_TTL_MS = 90_000

/**
 * How often a live session re-stamps `lastSeenAt`.
 *
 * Heartbeats arrive every 15s; writing presence on each one would cost one
 * mutation per device per 15s for no added truth. Throttling to 30s keeps the
 * cost at two writes a minute while leaving a 3x margin under PRESENCE_TTL_MS,
 * so a healthy device can miss two refreshes and still never flap offline.
 * Raising this above a third of the TTL reintroduces the flapping.
 */
export const PRESENCE_REFRESH_MS = 30_000

/**
 * The status a reader should act on, rather than the one the row happens to
 * hold. `revoked` is terminal and never decays into anything else.
 */
export function effectiveDeviceStatus(
  status: DeviceStatus,
  lastSeenAt: number | undefined,
  now: number,
): DeviceStatus {
  if (status === "revoked") return "revoked"
  if (status !== "online") return status
  if (lastSeenAt === undefined) return "offline"
  return now - lastSeenAt <= PRESENCE_TTL_MS ? "online" : "offline"
}

export type Device = {
  id: string
  userId: string
  workspaceId?: string
  displayName: string
  platform: DevicePlatform
  status: DeviceStatus
  /** Bumped on rotation; an older credential version is rejected. */
  credentialVersion: number
  lastSeenAt?: number
  /** Capabilities announced by the agent, e.g. `blender:scene.render`. */
  capabilities: string[]
}

/** What an agent reports per adapter after connecting (docs/11). */
export type CapabilityReport = {
  connector: string
  status: "available" | "unavailable"
  version?: string
  adapterVersion: string
  capabilities: string[]
}

export type ConnectionStatus = "active" | "expired" | "revoked" | "error"

export type Connection = {
  id: string
  connectorId: string
  ownerType: "user" | "workspace"
  ownerId: string
  authType: AuthType
  status: ConnectionStatus
}

/** Resolved credential for a cloud call. Never logged, never returned to a client. */
export type ConnectionCredential = {
  connectionId: string
  baseUrl: string
  token: string
}

export type PolicyRule = {
  connectorId: string
  /** Action id, or `*` for every action of the connector. */
  actionId: string
  decision: PolicyDecision
}
