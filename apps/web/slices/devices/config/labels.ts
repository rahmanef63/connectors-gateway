/**
 * Default copy for the `devices` slice. A consumer overrides any subset of it
 * through the `labels` prop — that is what makes the slice portable.
 */
import type { DevicesLabels } from "../types"

export const DEFAULT_DEVICES_LABELS: DevicesLabels = {
  panelTitle: "Devices",
  panelDescription: "Machines paired with your account and the adapters they announced.",
  loading: "Loading devices…",
  emptyTitle: "No paired devices",
  emptyDescription: "Run the local agent and approve the pairing code to see a machine here.",
  status: {
    online: "Online",
    offline: "Offline",
    revoked: "Revoked",
  },
  platform: {
    windows: "Windows",
    macos: "macOS",
    linux: "Linux",
  },
  capabilitiesTitle: "Capabilities",
  capabilitiesEmpty: "No capabilities announced yet.",
  capabilitiesUngrouped: "Other",
  lastSeenPrefix: "Last seen",
  lastSeenNever: "Never connected",
  rename: {
    action: "Rename",
    label: "Device name",
    placeholder: "Studio workstation",
    submit: "Save",
    cancel: "Cancel",
    invalid: "Enter a device name.",
    success: "Device renamed.",
  },
  revoke: {
    action: "Revoke",
    title: "Revoke this device?",
    description:
      "The device loses its credential and its active session is closed. Pair again to restore access.",
    confirm: "Revoke device",
    pending: "Revoking…",
    cancel: "Cancel",
    success: "Device revoked.",
  },
  pairing: {
    title: "Approve this device",
    description: "A local agent is asking to pair with your account.",
    deviceLabel: "Device",
    platformLabel: "Platform",
    expiresLabel: "Code expires",
    approve: "Approve device",
    approving: "Approving…",
    success: "Device approved.",
    missingTitle: "Pairing code not found",
    missingDescription: "The code is wrong or it was already used. Start pairing again.",
    expiredTitle: "Pairing code expired",
    expiredDescription: "Pairing codes are short-lived. Start pairing again from the agent.",
    approvedTitle: "Already approved",
    approvedDescription: "Finish the pairing in the agent window.",
    claimedTitle: "Pairing complete",
    claimedDescription: "The agent claimed its credential. This code cannot be reused.",
  },
  errors: {
    fallback: "Something went wrong. Try again.",
    NOT_AUTHENTICATED: "Sign in again to continue.",
    NOT_AUTHORIZED: "You do not have access to this device.",
    INVALID_INPUT: "That value is not valid.",
    DEVICE_REVOKED: "This device is already revoked.",
    RATE_LIMITED: "Too many attempts. Wait a moment and try again.",
    TIMEOUT: "The request timed out. Try again.",
    INTERNAL: "Something went wrong. Try again.",
  },
}
