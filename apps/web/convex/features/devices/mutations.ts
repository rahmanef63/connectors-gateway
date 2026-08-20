/**
 * User-facing device lifecycle mutations. Every operation resolves the row
 * through `ownedDevice`, so a device id belonging to another user is
 * indistinguishable from one that does not exist.
 *
 * Permanent deletion is deliberately NOT a synonym for revoke: a device must
 * first reach the terminal `revoked` state, then `forget` removes the durable
 * row. This preserves the credential/session termination boundary instead of
 * letting a delete button bypass it.
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

/**
 * Permanently forget one already-revoked device.
 *
 * The two-step invariant matters: deleting an active row directly would turn
 * revocation into an accidental side-effect instead of an explicit security
 * decision. A revoked/missing row is already non-routable; this mutation then
 * removes the durable device record plus its one expected short-lived relay
 * route. Audit history is intentionally retained because it stores only the
 * opaque device id, not the credential.
 */
export const forget = mutation({
  args: { deviceId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await requireUser(ctx)
    const deviceId = assertIdentifier(args.deviceId, "deviceId")
    const device = await ownedDevice(ctx, deviceId, userId)
    if (device === null) fail("NOT_AUTHORIZED", "Device not found.")
    if (device.status !== "revoked") {
      fail("INVALID_INPUT", "Revoke the device before forgetting it.")
    }

    const routes = await ctx.db
      .query("relayRoutes")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(2)
    if (routes.length > 1) fail("INTERNAL", "Relay route state is inconsistent.")
    const route = routes[0]
    if (route !== undefined) await ctx.db.delete(route._id)

    await ctx.db.delete(device._id)
    const timestamp = Date.now()
    await ctx.db.insert("auditLogs", {
      requestId: `device_forget_${deviceId}_${timestamp}`,
      timestamp,
      actorId: userId,
      userId,
      connectorId: "system.devices",
      actionId: "device.forget",
      executorKind: "none",
      deviceId,
      policyDecision: "ALLOW",
      status: "success",
      latencyMs: 0,
    })
    return null
  },
})
