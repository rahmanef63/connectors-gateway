/**
 * Indexed point reads. Everything here is `.withIndex(...).first()` — the
 * external ids the gateway mints are not Convex document ids, so `db.get`
 * is never the right tool for them.
 */
import type { Doc } from "../_generated/dataModel"
import type { AuthCtx } from "./auth"

export async function deviceByExternalId(
  ctx: AuthCtx,
  deviceId: string,
): Promise<Doc<"devices"> | null> {
  return await ctx.db
    .query("devices")
    .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
    .first()
}

export async function challengeByExternalId(
  ctx: AuthCtx,
  challengeId: string,
): Promise<Doc<"pairingChallenges"> | null> {
  return await ctx.db
    .query("pairingChallenges")
    .withIndex("by_challengeId", (q) => q.eq("challengeId", challengeId))
    .first()
}

export async function challengeByCode(
  ctx: AuthCtx,
  code: string,
): Promise<Doc<"pairingChallenges"> | null> {
  return await ctx.db
    .query("pairingChallenges")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first()
}

export async function apiKeyByKeyId(ctx: AuthCtx, keyId: string): Promise<Doc<"apiKeys"> | null> {
  return await ctx.db
    .query("apiKeys")
    .withIndex("by_keyId", (q) => q.eq("keyId", keyId))
    .first()
}

/**
 * A device the caller owns, or `null`. Missing and foreign are the same
 * answer on purpose: distinguishing them turns the endpoint into an
 * existence oracle for other users' device ids.
 */
export async function ownedDevice(
  ctx: AuthCtx,
  deviceId: string,
  userId: string,
): Promise<Doc<"devices"> | null> {
  const device = await deviceByExternalId(ctx, deviceId)
  if (device === null || device.userId !== userId) return null
  return device
}
