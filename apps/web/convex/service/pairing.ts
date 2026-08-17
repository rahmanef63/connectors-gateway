/**
 * Gateway-facing pairing store — docs/04-device-pairing.md.
 * "service/pairing:createChallenge" / ":getByCode" / ":claim".
 */
import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { requireService } from "../_shared/auth"
import { deviceRecordValidator, toDeviceRecord } from "../_shared/device_record"
import { fail } from "../_shared/errors"
import {
  assertDisplayName,
  assertFutureTimestamp,
  assertIdentifier,
  assertPairingCode,
} from "../_shared/input"
import { MAX_DISPLAY_NAME_LENGTH } from "../_shared/limits"
import { challengeByCode, challengeByExternalId, deviceByExternalId } from "../_shared/lookup"
import {
  pairingChallengeValidator,
  toPairingChallenge,
  type PairingChallengeRecord,
} from "../_shared/pairing_record"
import { platformValidator } from "../_shared/validators"

export const createChallenge = mutation({
  args: {
    serviceToken: v.string(),
    id: v.string(),
    code: v.string(),
    deviceName: v.string(),
    platform: platformValidator,
    expiresAt: v.number(),
  },
  returns: pairingChallengeValidator,
  handler: async (ctx, args): Promise<PairingChallengeRecord> => {
    requireService(ctx, args.serviceToken)
    const now = Date.now()
    const challengeId = assertIdentifier(args.id, "id")
    const code = assertPairingCode(args.code)
    // A machine hostname is truncated rather than refused, but it still has to
    // be a printable, non-empty name.
    const deviceName = assertDisplayName(args.deviceName.slice(0, MAX_DISPLAY_NAME_LENGTH))
    assertFutureTimestamp(args.expiresAt, now)

    // A colliding code would let one agent claim another agent's approval.
    if ((await challengeByCode(ctx, code)) !== null) {
      fail("INVALID_INPUT", "Pairing code is already in use.")
    }
    if ((await challengeByExternalId(ctx, challengeId)) !== null) {
      fail("INVALID_INPUT", "Pairing challenge already exists.")
    }

    const rowId = await ctx.db.insert("pairingChallenges", {
      challengeId,
      code,
      deviceName,
      platform: args.platform,
      status: "pending",
      expiresAt: args.expiresAt,
    })
    const created = await ctx.db.get(rowId)
    if (created === null) fail("INTERNAL", "Pairing challenge could not be created.")
    return toPairingChallenge(created, now)
  },
})

export const getByCode = query({
  args: { serviceToken: v.string(), code: v.string() },
  returns: v.union(pairingChallengeValidator, v.null()),
  handler: async (ctx, args): Promise<PairingChallengeRecord | null> => {
    requireService(ctx, args.serviceToken)
    const challenge = await challengeByCode(ctx, assertPairingCode(args.code))
    return challenge === null ? null : toPairingChallenge(challenge, Date.now())
  },
})

/**
 * One-time, atomic claim. Convex mutations are serializable transactions, so
 * the approved + unexpired + unclaimed check and the "claimed" write cannot
 * interleave: the second caller reads `claimed` and gets `null`.
 *
 * `credentialHash` is computed by the gateway before this call — that is why
 * `deviceId` is minted there too, and why no plaintext credential is an
 * argument here.
 */
export const claim = mutation({
  args: {
    serviceToken: v.string(),
    challengeId: v.string(),
    deviceId: v.string(),
    credentialHash: v.string(),
  },
  returns: v.union(v.object({ device: deviceRecordValidator }), v.null()),
  handler: async (ctx, args) => {
    requireService(ctx, args.serviceToken)
    const now = Date.now()
    const challengeId = assertIdentifier(args.challengeId, "challengeId")
    const deviceId = assertIdentifier(args.deviceId, "deviceId")
    if (args.credentialHash.length === 0) {
      fail("INVALID_INPUT", "A credential hash is required.")
    }

    const challenge = await challengeByExternalId(ctx, challengeId)
    if (challenge === null) return null
    if (challenge.status !== "approved" || challenge.userId === undefined) return null
    if (challenge.expiresAt <= now) {
      await ctx.db.patch(challenge._id, { status: "expired" })
      return null
    }
    if ((await deviceByExternalId(ctx, deviceId)) !== null) {
      fail("INVALID_INPUT", "Device already registered.")
    }

    const rowId = await ctx.db.insert("devices", {
      deviceId,
      userId: challenge.userId,
      displayName: challenge.deviceName,
      platform: challenge.platform,
      status: "offline",
      credentialHash: args.credentialHash,
      credentialVersion: 1,
      capabilities: [],
    })
    await ctx.db.patch(challenge._id, { status: "claimed", deviceId })

    const device = await ctx.db.get(rowId)
    if (device === null) fail("INTERNAL", "Device could not be created.")
    return { device: toDeviceRecord(device, Date.now()) }
  },
})
