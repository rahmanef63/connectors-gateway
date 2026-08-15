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
    title: "Approve this machine?",
    description:
      "A local agent on this machine is asking for permission to run actions on it, for you. Approve only if you started this pairing yourself, on this machine, just now.",
    deviceLabel: "Machine",
    platformLabel: "Platform",
    expiresLabel: "Code expires",
    grantsTitle: "Approving this machine means:",
    grants: {
      localActions:
        "it may run local actions on itself — opening, editing and rendering files in the applications it announced;",
      credential:
        "it receives a device credential that stays on that machine. It is never shown on this page, and never handed to ChatGPT, Claude or any other AI client;",
      perCallChecks:
        "every action it runs is still checked against your permissions on every single call, and dangerous capabilities stay off unless you turn them on;",
      revocable:
        "it keeps this access until you revoke it from Devices, which ends its session immediately.",
    },
    credentialNotice:
      "Nothing secret is displayed here. The machine collects its own credential directly from the gateway, and no AI client ever sees it.",
    approve: "Approve this machine",
    approving: "Approving…",
    success: "Machine approved. It can collect its credential now.",
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
