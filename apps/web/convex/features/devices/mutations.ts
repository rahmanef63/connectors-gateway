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
 * for a job.
 *
 * It does NOT yet tear down a socket that is already open — the relay only reads
 * the control plane at connect time. The live session is inert (job dispatch
 * rejects with DEVICE_REVOKED and presence updates are dropped), but docs/04
 * "revoking a device terminates its active session" is not literally true until
 * the relay polls or the control plane can push.
 * TODO(rr): close open sockets on revoke — needs a relay sweep or a push channel.
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
