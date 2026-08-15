/**
 * Pairing challenge wire shape — matches `PairingChallenge` in `@cg/core`,
 * so the field is `id`, not the stored `challengeId`.
 *
 * A stored `pending` row whose deadline has passed reports as `expired`:
 * queries cannot write, so expiry is derived on read and only persisted the
 * next time a mutation touches the row.
 */
import { type Infer, v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { challengeStatusValidator, platformValidator } from "./validators"

export const pairingChallengeValidator = v.object({
  id: v.string(),
  code: v.string(),
  deviceName: v.string(),
  platform: platformValidator,
  status: challengeStatusValidator,
  expiresAt: v.number(),
  userId: v.optional(v.string()),
})

/** What the dashboard needs to render the approval prompt. No user id. */
export const pairingPromptValidator = v.object({
  code: v.string(),
  deviceName: v.string(),
  platform: platformValidator,
  status: challengeStatusValidator,
  expiresAt: v.number(),
})

export type PairingChallengeRecord = Infer<typeof pairingChallengeValidator>
export type PairingPrompt = Infer<typeof pairingPromptValidator>

export function effectiveStatus(doc: Doc<"pairingChallenges">, now: number): Doc<"pairingChallenges">["status"] {
  if (doc.status === "claimed" || doc.status === "expired") return doc.status
  return doc.expiresAt <= now ? "expired" : doc.status
}

export function toPairingChallenge(
  doc: Doc<"pairingChallenges">,
  now: number,
): PairingChallengeRecord {
  return {
    id: doc.challengeId,
    code: doc.code,
    deviceName: doc.deviceName,
    platform: doc.platform,
    status: effectiveStatus(doc, now),
    expiresAt: doc.expiresAt,
    ...(doc.userId === undefined ? {} : { userId: doc.userId }),
  }
}

export function toPairingPrompt(doc: Doc<"pairingChallenges">, now: number): PairingPrompt {
  return {
    code: doc.code,
    deviceName: doc.deviceName,
    platform: doc.platform,
    status: effectiveStatus(doc, now),
    expiresAt: doc.expiresAt,
  }
}
