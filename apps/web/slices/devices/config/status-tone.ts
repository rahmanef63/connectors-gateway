/**
 * Status vocabulary → semantic tone → badge variant.
 * Lookup tables, never an if-chain: adding a `DeviceStatus` to @cg/core makes
 * this file fail to typecheck instead of silently falling through a branch.
 */
import type { DeviceStatus } from "@cg/core"
import type { BadgeVariant, Tone } from "../types"

export const DEVICE_STATUS_TONES: Readonly<Record<DeviceStatus, Tone>> = Object.freeze({
  online: "positive",
  offline: "neutral",
  revoked: "danger",
})

export const TONE_BADGE_VARIANTS: Readonly<Record<Tone, BadgeVariant>> = Object.freeze({
  positive: "success",
  neutral: "outline",
  muted: "secondary",
  warning: "warning",
  danger: "destructive",
})

export function toneForStatus(status: DeviceStatus): Tone {
  return DEVICE_STATUS_TONES[status]
}

export function badgeVariantForStatus(status: DeviceStatus): BadgeVariant {
  return TONE_BADGE_VARIANTS[DEVICE_STATUS_TONES[status]]
}
