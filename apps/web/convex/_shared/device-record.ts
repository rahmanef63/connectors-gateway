/**
 * Device wire shapes. Two of them on purpose: the service shape carries the
 * credential hash because the gateway verifies credentials, the user shape
 * never does (AGENTS.md invariant 4 — an AI client never sees device
 * credentials, and neither does the dashboard).
 */
import { type Infer, v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { deviceStatusValidator, platformValidator } from "./validators"

export const deviceRecordValidator = v.object({
  deviceId: v.string(),
  userId: v.string(),
  workspaceId: v.optional(v.string()),
  displayName: v.string(),
  platform: platformValidator,
  status: deviceStatusValidator,
  credentialHash: v.string(),
  credentialVersion: v.number(),
  capabilities: v.array(v.string()),
  lastSeenAt: v.optional(v.number()),
})

export const deviceSummaryValidator = v.object({
  deviceId: v.string(),
  workspaceId: v.optional(v.string()),
  displayName: v.string(),
  platform: platformValidator,
  status: deviceStatusValidator,
  capabilities: v.array(v.string()),
  lastSeenAt: v.optional(v.number()),
})

export type DeviceRecord = Infer<typeof deviceRecordValidator>
export type DeviceSummary = Infer<typeof deviceSummaryValidator>

export function toDeviceRecord(doc: Doc<"devices">): DeviceRecord {
  return {
    deviceId: doc.deviceId,
    userId: doc.userId,
    ...(doc.workspaceId === undefined ? {} : { workspaceId: doc.workspaceId }),
    displayName: doc.displayName,
    platform: doc.platform,
    status: doc.status,
    credentialHash: doc.credentialHash,
    credentialVersion: doc.credentialVersion,
    capabilities: doc.capabilities,
    ...(doc.lastSeenAt === undefined ? {} : { lastSeenAt: doc.lastSeenAt }),
  }
}

export function toDeviceSummary(doc: Doc<"devices">): DeviceSummary {
  return {
    deviceId: doc.deviceId,
    ...(doc.workspaceId === undefined ? {} : { workspaceId: doc.workspaceId }),
    displayName: doc.displayName,
    platform: doc.platform,
    status: doc.status,
    capabilities: doc.capabilities,
    ...(doc.lastSeenAt === undefined ? {} : { lastSeenAt: doc.lastSeenAt }),
  }
}
