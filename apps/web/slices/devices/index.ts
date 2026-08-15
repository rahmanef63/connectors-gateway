/**
 * `devices` slice — public surface.
 * Everything not listed here is internal to the slice.
 */

export { DevicesPanel } from "./components/devices-panel"
export type { DevicesPanelProps, PreloadedDeviceList } from "./components/devices-panel"
export { DeviceCard } from "./components/device-card"
export type { DeviceCardProps } from "./components/device-card"
export { DeviceStatusBadge } from "./components/device-status-badge"
export type { DeviceStatusBadgeProps } from "./components/device-status-badge"
export { CapabilityList } from "./components/capability-list"
export type { CapabilityListProps } from "./components/capability-list"
export { RevokeDeviceDialog } from "./components/revoke-device-dialog"
export type { RevokeDeviceDialogProps } from "./components/revoke-device-dialog"
export { PairApprovalPanel } from "./components/pair-approval-panel"
export type { PairApprovalPanelProps, PreloadedPairingChallenge } from "./components/pair-approval-panel"

export { useRevokeDevice } from "./hooks/use-revoke-device"
export type { UseRevokeDevice } from "./hooks/use-revoke-device"
export { useRenameDevice } from "./hooks/use-rename-device"
export type { UseRenameDevice } from "./hooks/use-rename-device"
export { useApprovePairing } from "./hooks/use-approve-pairing"
export type { UseApprovePairing } from "./hooks/use-approve-pairing"

export { DEFAULT_DEVICES_LABELS } from "./config/labels"
export type { LabelOverride } from "./lib/labels"
export type { TimestampFormatOptions } from "./lib/format"

export type {
  CapabilityGroup,
  DeviceView,
  DevicesLabels,
  PairingChallengeView,
  PairingState,
  Tone,
} from "./types"
