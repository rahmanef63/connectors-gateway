/**
 * Pure state machine behind /pair. The Approve mutation is the authority;
 * this only decides which copy the screen shows, so `now` is injected
 * (the server passes one timestamp down, keeping SSR and hydration identical).
 */
import { DEVICE_PLATFORMS, type DevicePlatform, type PairingChallenge } from "@cg/core"

export type PairingChallengeView = Pick<
  PairingChallenge,
  "code" | "deviceName" | "platform" | "status" | "expiresAt"
>

export const PAIRING_VIEW_STATES = [
  "missing_code",
  "unknown",
  "claimed",
  "expired",
  "approved",
  "ready",
] as const
export type PairingViewState = (typeof PAIRING_VIEW_STATES)[number]

const CHALLENGE_STATUSES: readonly PairingChallenge["status"][] = [
  "pending",
  "approved",
  "claimed",
  "expired",
]

function isPlatform(value: unknown): value is DevicePlatform {
  return typeof value === "string" && (DEVICE_PLATFORMS as readonly string[]).includes(value)
}

/**
 * Shape guard for the Convex payload. A row that does not match is treated as
 * an unknown code rather than half-trusted.
 */
export function toChallengeView(value: unknown): PairingChallengeView | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const { code, deviceName, platform, status, expiresAt } = record

  if (typeof code !== "string" || code.length === 0) return null
  if (typeof deviceName !== "string" || deviceName.length === 0) return null
  if (!isPlatform(platform)) return null
  if (typeof status !== "string") return null
  if (!(CHALLENGE_STATUSES as readonly string[]).includes(status)) return null
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null

  return {
    code,
    deviceName,
    platform,
    status: status as PairingChallenge["status"],
    expiresAt,
  }
}

/** Order matters: a claimed code is terminal even after it has expired. */
export function pairingViewState(input: {
  code: string | null
  challenge: PairingChallengeView | null
  now: number
}): PairingViewState {
  if (input.code === null) return "missing_code"
  if (input.challenge === null) return "unknown"

  const { challenge } = input
  if (challenge.status === "claimed") return "claimed"
  if (challenge.status === "expired" || challenge.expiresAt <= input.now) return "expired"
  if (challenge.status === "approved") return "approved"
  return "ready"
}

/** Only one state offers the Approve button. */
export function canApprove(state: PairingViewState): boolean {
  return state === "ready"
}
