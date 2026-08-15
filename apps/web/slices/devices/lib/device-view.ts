/**
 * Normalizes control-plane device records into the slice's view type.
 *
 * A record missing an identity or carrying an unknown platform/status is
 * dropped rather than coerced: `status` drives a security-relevant badge, and
 * guessing "offline" for an unreadable value would be a lie the user acts on.
 *
 * Fields are read one by one, never spread, so a record that grows a
 * `credentialHash` upstream can never reach the DOM (AGENTS.md invariant 4).
 */
import { DEVICE_PLATFORMS } from "@cg/core"
import type { DevicePlatform, DeviceStatus } from "@cg/core"
import { DEVICE_STATUS_TONES } from "../config/status-tone"
import type { DeviceView } from "../types"
import { isRecord, readNumber, readString, readStringArray } from "./guards"

function readPlatform(value: unknown): DevicePlatform | undefined {
  const text = readString(value)
  if (text === undefined) return undefined
  return (DEVICE_PLATFORMS as readonly string[]).includes(text) ? (text as DevicePlatform) : undefined
}

/** The tone table is keyed by every `DeviceStatus`, so it is the status list. */
function readStatus(value: unknown): DeviceStatus | undefined {
  const text = readString(value)
  if (text === undefined) return undefined
  return Object.hasOwn(DEVICE_STATUS_TONES, text) ? (text as DeviceStatus) : undefined
}

export function toDeviceView(record: unknown): DeviceView | null {
  if (!isRecord(record)) return null

  const deviceId = readString(record.deviceId) ?? readString(record.id)
  const platform = readPlatform(record.platform)
  const status = readStatus(record.status)
  if (deviceId === undefined || platform === undefined || status === undefined) return null

  return {
    deviceId,
    workspaceId: readString(record.workspaceId),
    displayName: readString(record.displayName) ?? deviceId,
    platform,
    status,
    capabilities: readStringArray(record.capabilities),
    lastSeenAt: readNumber(record.lastSeenAt),
  }
}

export function toDeviceViews(records: unknown): DeviceView[] {
  if (!Array.isArray(records)) return []
  const out: DeviceView[] = []
  for (const record of records) {
    const view = toDeviceView(record)
    if (view !== null) out.push(view)
  }
  return out
}
