/**
 * Pairing-challenge view normalization and state resolution (docs/04).
 * The panel renders one of six states; the decision lives here, not in JSX.
 */
import { DEVICE_PLATFORMS } from "@cg/core"
import type { DevicePlatform } from "@cg/core"
import type { DevicesLabels, PairingChallengeView, PairingState } from "../types"
import { isRecord, readNumber, readString } from "./guards"

export type PairingNotice = { title: string; description: string }

const CHALLENGE_STATUSES = ["pending", "approved", "claimed", "expired"] as const
type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number]

function readChallengeStatus(value: unknown): ChallengeStatus | undefined {
  const text = readString(value)
  if (text === undefined) return undefined
  return (CHALLENGE_STATUSES as readonly string[]).includes(text) ? (text as ChallengeStatus) : undefined
}

function readPlatform(value: unknown): DevicePlatform | undefined {
  const text = readString(value)
  if (text === undefined) return undefined
  return (DEVICE_PLATFORMS as readonly string[]).includes(text) ? (text as DevicePlatform) : undefined
}

const PAIRING_CODE_PATTERN = /^[A-Z0-9-]{6,32}$/

/**
 * Shape guard for a code taken from the URL. The control plane validates it
 * again and is the authority; this only stops a malformed `?code=` from being
 * sent at all, so a hostile link renders "not found" instead of throwing
 * through the render tree.
 */
export function normalizePairingCode(value: unknown): string | null {
  const text = readString(value)
  if (text === undefined) return null
  const normalized = text.trim().toUpperCase()
  return PAIRING_CODE_PATTERN.test(normalized) ? normalized : null
}

export function toPairingChallengeView(record: unknown): PairingChallengeView | null {
  if (!isRecord(record)) return null
  const code = readString(record.code)
  const deviceName = readString(record.deviceName)
  const platform = readPlatform(record.platform)
  const status = readChallengeStatus(record.status)
  const expiresAt = readNumber(record.expiresAt)
  if (
    code === undefined ||
    deviceName === undefined ||
    platform === undefined ||
    status === undefined ||
    expiresAt === undefined
  ) {
    return null
  }
  return { code, deviceName, platform, status, expiresAt }
}

/**
 * `undefined` means the query has not resolved yet; `null` means the code is
 * unknown or already consumed. A claimed code is terminal, so it outranks
 * expiry; expiry outranks approval because an expired code cannot be claimed.
 */
export function resolvePairingState(
  challenge: PairingChallengeView | null | undefined,
  now: number,
): PairingState {
  if (challenge === undefined) return "loading"
  if (challenge === null) return "missing"
  if (challenge.status === "claimed") return "claimed"
  if (challenge.status === "expired" || challenge.expiresAt <= now) return "expired"
  if (challenge.status === "approved") return "approved"
  return "pending"
}

export function isApprovable(state: PairingState): boolean {
  return state === "pending"
}

/**
 * Reading order of the grant list on the approval screen. The action the user
 * is granting comes first, the credential guarantee second — a reader who stops
 * after two bullets has still read both halves of the consequence.
 *
 * Typed against the labels shape, so a key renamed in `DevicesLabels` fails to
 * compile here instead of quietly dropping a bullet from the screen.
 */
export const PAIRING_GRANT_ORDER: readonly (keyof DevicesLabels["pairing"]["grants"])[] = [
  "localActions",
  "credential",
  "perCallChecks",
  "revocable",
]

/**
 * The grant bullets, in reading order. Pure: copy in, strings out.
 *
 * A non-string or an empty override is skipped rather than rendered as a blank
 * bullet — that is how a consumer suppresses a line it states elsewhere.
 */
export function pairingGrants(labels: DevicesLabels): string[] {
  const grants: Record<string, unknown> = labels.pairing.grants
  const out: string[] = []
  for (const key of PAIRING_GRANT_ORDER) {
    const text = readString(grants[key])
    if (text !== undefined) out.push(text)
  }
  return out
}

/** Copy for every non-actionable state, by lookup rather than by branch. */
export function pairingNotice(
  state: Exclude<PairingState, "pending">,
  labels: DevicesLabels,
): PairingNotice {
  const notices: Readonly<Record<Exclude<PairingState, "pending">, PairingNotice>> = {
    loading: { title: labels.loading, description: "" },
    missing: { title: labels.pairing.missingTitle, description: labels.pairing.missingDescription },
    expired: { title: labels.pairing.expiredTitle, description: labels.pairing.expiredDescription },
    approved: { title: labels.pairing.approvedTitle, description: labels.pairing.approvedDescription },
    claimed: { title: labels.pairing.claimedTitle, description: labels.pairing.claimedDescription },
  }
  return notices[state]
}
