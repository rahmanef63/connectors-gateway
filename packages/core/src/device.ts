/**
 * Control-plane records: devices, connections, policy rules.
 * Shapes follow docs/04-device-pairing.md and docs/08-auth-and-identity.md.
 */
import type { AuthType, PolicyDecision } from "./risk"

export const DEVICE_PLATFORMS = ["windows", "macos", "linux"] as const
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number]

export type DeviceStatus = "online" | "offline" | "revoked"

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
