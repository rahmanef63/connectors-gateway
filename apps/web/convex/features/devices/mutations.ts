/**
 * Device revoke + rename. Both resolve the row through `ownedDevice`, so a
 * device id belonging to another user is indistinguishable from one that does
 * not exist.
 */
import { v } from "convex/values"
import { mutation } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import { fail } from "../../_shared/errors"
import { assertDisplayName, assertIdentifier } from "../../_shared/input"
import { ownedDevice } from "../../_shared/lookup"

/**
 * Revocation is terminal and idempotent: the status flips to `revoked`, so the
 * device fails authentication on its next `hello` and can no longer be selected
 * for a job. The relay also revalidates every live socket against this durable
 * row every 30 seconds; once this status is visible it removes the socket from
 * dispatch, fails in-flight work with DEVICE_REVOKED, and closes with code 4003.
 */
export const revoke = mutation({
  args: { deviceId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await requireUser(ctx)
    const device = await ownedDevice(ctx, assertIdentifier(args.deviceId, "deviceId"), userId)
    if (device === null) fail("NOT_AUTHORIZED", "Device not found.")
    if (device.status !== "revoked") {
      await ctx.db.patch(device._id, { status: "revoked" })
    }
    return null
  },
})

/** Renaming never changes device identity or its credential (docs/04). */
export const rename = mutation({
  args: { deviceId: v.string(), displayName: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await requireUser(ctx)
    const displayName = assertDisplayName(args.displayName)
    const device = await ownedDevice(ctx, assertIdentifier(args.deviceId, "deviceId"), userId)
    if (device === null) fail("NOT_AUTHORIZED", "Device not found.")
    await ctx.db.patch(device._id, { displayName })
    return null
  },
})
