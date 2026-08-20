/**
 * View types for the `devices` slice.
 * Domain shapes come from @cg/core; nothing here re-declares them.
 */
import type { Device, DevicePlatform, DeviceStatus } from "@cg/core"
import type { Tone } from "@/components/status-badge"

/**
 * A device row as the dashboard renders it.
 *
 * The control plane keys the device by `deviceId` (pinned
 * `service/devices:getRecord` contract) and deliberately withholds `userId`
 * and `credentialVersion` from the user-facing summary — the dashboard never
 * needs either, so the view type cannot carry them.
 */
export type DeviceView = Omit<Device, "id" | "userId" | "credentialVersion"> & { deviceId: string }

/**
 * Semantic tone. Re-exported from the app's tone SSOT (`components/status-badge`)
 * rather than re-declared: the slice names a MEANING and the host resolves the
 * colour, so a device status can never be painted a green this app uses nowhere
 * else. A host that mounts the slice must provide that module.
 */
export type { Tone }

/** Announced capabilities grouped by their `connector:` namespace. */
export type CapabilityGroup = {
  /** `null` when the capability was announced without a namespace. */
  connector: string | null
  capabilities: string[]
}

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
  forget: {
    action: string
    title: string
    description: string
    confirm: string
    pending: string
    cancel: string
    success: string
  }
  /** Keyed by @cg/core `ErrorCode`; `fallback` is used for anything else. */
  errors: Record<string, string> & { fallback: string }
}
