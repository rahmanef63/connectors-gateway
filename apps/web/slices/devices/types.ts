/**
 * View types for the `devices` slice.
 * Domain shapes come from @cg/core; nothing here re-declares them.
 */
import type { Device, DevicePlatform, DeviceStatus, PairingChallenge } from "@cg/core"

/**
 * A device row as the dashboard renders it.
 *
 * The control plane keys the device by `deviceId` (pinned
 * `service/devices:getRecord` contract) and deliberately withholds `userId`
 * and `credentialVersion` from the user-facing summary — the dashboard never
 * needs either, so the view type cannot carry them.
 */
export type DeviceView = Omit<Device, "id" | "userId" | "credentialVersion"> & { deviceId: string }

/** Semantic tone, independent of any design-system variant vocabulary. */
export type Tone = "positive" | "neutral" | "muted" | "warning" | "danger"

/** Variant vocabulary of the consumer's badge primitive. */
export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "outline"

/** Announced capabilities grouped by their `connector:` namespace. */
export type CapabilityGroup = {
  /** `null` when the capability was announced without a namespace. */
  connector: string | null
  capabilities: string[]
}

/** Pairing challenge as shown to the approving user — never carries `userId`. */
export type PairingChallengeView = Pick<
  PairingChallenge,
  "code" | "deviceName" | "platform" | "status" | "expiresAt"
>

/** Resolved rendering state of the pairing panel. */
export type PairingState = "loading" | "missing" | "expired" | "approved" | "claimed" | "pending"

/** Copy contract. Every user-visible string in the slice comes from here. */
export type DevicesLabels = {
  panelTitle: string
  panelDescription: string
  loading: string
  emptyTitle: string
  emptyDescription: string
  status: Record<DeviceStatus, string>
  platform: Record<DevicePlatform, string>
  capabilitiesTitle: string
  capabilitiesEmpty: string
  capabilitiesUngrouped: string
  lastSeenPrefix: string
  lastSeenNever: string
  rename: {
    action: string
    label: string
    placeholder: string
    submit: string
    cancel: string
    invalid: string
    success: string
  }
  revoke: {
    action: string
    title: string
    description: string
    confirm: string
    pending: string
    cancel: string
    success: string
  }
  pairing: {
    title: string
    description: string
    deviceLabel: string
    platformLabel: string
    expiresLabel: string
    approve: string
    approving: string
    success: string
    missingTitle: string
    missingDescription: string
    expiredTitle: string
    expiredDescription: string
    approvedTitle: string
    approvedDescription: string
    claimedTitle: string
    claimedDescription: string
  }
  /** Keyed by @cg/core `ErrorCode`; `fallback` is used for anything else. */
  errors: Record<string, string> & { fallback: string }
}
