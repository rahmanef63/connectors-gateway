/**
 * Status vocabulary → semantic tone.
 *
 * A lookup table, never an if-chain: adding a `DeviceStatus` to @cg/core makes
 * this file fail to typecheck instead of silently falling through a branch.
 *
 * The table stops at the tone. The colour behind that tone belongs to the host's
 * tone SSOT (`components/status-badge`), which `DeviceStatusBadge` renders
 * through — so this slice owns the meaning of a status and never its paint.
 */
import type { DeviceStatus } from "@cg/core"
import type { Tone } from "../types"

export const DEVICE_STATUS_TONES: Readonly<Record<DeviceStatus, Tone>> = Object.freeze({
  online: "success",
  offline: "neutral",
  revoked: "danger",
})

export function toneForStatus(status: DeviceStatus): Tone {
  return DEVICE_STATUS_TONES[status]
}
