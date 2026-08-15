/**
 * Control-plane responses are external input (AGENTS.md P0). A row that fails
 * its shape check is treated as ABSENT, never as partially trusted: a half-read
 * device row could otherwise skip a revocation check.
 */
import { DEVICE_PLATFORMS, POLICY_DECISIONS } from "@cg/core"
import type { Connection, Device, PolicyRule } from "@cg/core"
import type { PairingChallenge } from "@cg/core"
import type { ApiKeyRecord } from "@cg/auth"

/** A device row plus the secret material the relay needs to authenticate it. */
export type DeviceRecord = Device & { credentialHash: string }

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function optionalStr(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string"
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []
}

function oneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value)
}

const DEVICE_STATUSES = ["online", "offline", "revoked"] as const
const CONNECTION_STATUSES = ["active", "expired", "revoked", "error"] as const
const CHALLENGE_STATUSES = ["pending", "approved", "claimed", "expired"] as const

export function toDevice(value: unknown): Device | null {
  const row = asRecord(value)
  if (!row) return null
  const id = row.deviceId ?? row.id
  if (!str(id) || !str(row.userId) || !str(row.displayName)) return null
  if (!oneOf(row.platform, DEVICE_PLATFORMS) || !oneOf(row.status, DEVICE_STATUSES)) return null
  if (!optionalStr(row.workspaceId)) return null

  const device: Device = {
    id,
    userId: row.userId,
    displayName: row.displayName,
    platform: row.platform as Device["platform"],
    status: row.status as Device["status"],
    credentialVersion: typeof row.credentialVersion === "number" ? row.credentialVersion : 1,
    capabilities: asStringArray(row.capabilities),
  }
  if (str(row.workspaceId)) device.workspaceId = row.workspaceId
  if (typeof row.lastSeenAt === "number") device.lastSeenAt = row.lastSeenAt
  return device
}

export function toDeviceRecord(value: unknown): DeviceRecord | null {
  const device = toDevice(value)
  const row = asRecord(value)
  if (!device || !row || !str(row.credentialHash)) return null
  return { ...device, credentialHash: row.credentialHash }
}

export function toDevices(value: unknown): Device[] {
  if (!Array.isArray(value)) return []
  return value.map(toDevice).filter((device): device is Device => device !== null)
}

export function toPairingChallenge(value: unknown): PairingChallenge | null {
  const row = asRecord(value)
  if (!row || !str(row.id) || !str(row.code) || !str(row.deviceName)) return null
  if (!oneOf(row.platform, DEVICE_PLATFORMS) || !oneOf(row.status, CHALLENGE_STATUSES)) return null
  if (typeof row.expiresAt !== "number") return null

  const challenge: PairingChallenge = {
    id: row.id,
    code: row.code,
    deviceName: row.deviceName,
    platform: row.platform as PairingChallenge["platform"],
    status: row.status as PairingChallenge["status"],
    expiresAt: row.expiresAt,
  }
  if (str(row.userId)) challenge.userId = row.userId
  return challenge
}

export function toPolicyRules(value: unknown): PolicyRule[] {
  if (!Array.isArray(value)) return []
  const rules: PolicyRule[] = []
  for (const entry of value) {
    const row = asRecord(entry)
    if (!row || !str(row.connectorId) || !str(row.actionId)) continue
    if (!oneOf(row.decision, POLICY_DECISIONS)) continue
    rules.push({
      connectorId: row.connectorId,
      actionId: row.actionId,
      decision: row.decision as PolicyRule["decision"],
    })
  }
  return rules
}

export function toConnections(value: unknown): Connection[] {
  if (!Array.isArray(value)) return []
  const connections: Connection[] = []
  for (const entry of value) {
    const row = asRecord(entry)
    if (!row || !str(row.id) || !str(row.connectorId) || !str(row.ownerId)) continue
    if (!oneOf(row.status, CONNECTION_STATUSES)) continue
    if (row.ownerType !== "user" && row.ownerType !== "workspace") continue
    connections.push({
      id: row.id,
      connectorId: row.connectorId,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      authType: (str(row.authType) ? row.authType : "custom") as Connection["authType"],
      status: row.status as Connection["status"],
    })
  }
  return connections
}

/** `tokenCipher` stays ciphertext here — only @cg/auth's secret-box opens it. */
export function toStoredCredential(
  value: unknown,
): { connectionId: string; baseUrl: string; tokenCipher: string } | null {
  const row = asRecord(value)
  if (!row || !str(row.connectionId) || !str(row.baseUrl) || !str(row.tokenCipher)) return null
  return { connectionId: row.connectionId, baseUrl: row.baseUrl, tokenCipher: row.tokenCipher }
}

export function toApiKeyRecord(value: unknown): ApiKeyRecord | null {
  const row = asRecord(value)
  const id = row?.keyId ?? row?.id
  if (!row || !str(id) || !str(row.userId) || !str(row.secretHash)) return null
  if (!oneOf(row.status, ["active", "revoked", "expired"])) return null

  const record: ApiKeyRecord = {
    id,
    userId: row.userId,
    scopes: asStringArray(row.scopes),
    status: row.status as ApiKeyRecord["status"],
    secretHash: row.secretHash,
  }
  if (str(row.workspaceId)) record.workspaceId = row.workspaceId
  if (typeof row.expiresAt === "number") record.expiresAt = row.expiresAt
  return record
}
