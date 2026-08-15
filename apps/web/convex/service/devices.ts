/**
 * Gateway-facing device store. Referenced by string from the gateway process:
 * "service/devices:getRecord" / ":listForUser" / ":setPresence".
 */
import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { requireService } from "../_shared/auth"
import {
  deviceRecordValidator,
  toDeviceRecord,
  type DeviceRecord,
} from "../_shared/device_record"
import { fail } from "../_shared/errors"
import { assertIdentifier } from "../_shared/input"
import { MAX_DEVICES_PER_USER } from "../_shared/limits"
import { deviceByExternalId } from "../_shared/lookup"

/**
 * Point read used to authenticate a device credential.
 *
 * The row is returned with its REAL `status`, revoked included. Filtering
 * revoked rows out here looked fail-closed but was the opposite of safe: the
 * relay's only revoked branch became unreachable, so revoking a device closed
 * its next session with 4001 ("your credential was rejected — re-pair") instead
 * of 4003 ("revoked — stop reconnecting"), and the credential check was skipped
 * entirely rather than run before the status branch.
 *
 * Callers MUST reject `status: "revoked"`. The gateway does it twice, in
 * `store/devices.ts:authenticateDevice` and again inside
 * `@cg/auth:verifyDeviceCredential`.
 */
export const getRecord = query({
  args: { serviceToken: v.string(), deviceId: v.string() },
  returns: v.union(deviceRecordValidator, v.null()),
  handler: async (ctx, args): Promise<DeviceRecord | null> => {
    requireService(ctx, args.serviceToken)
    const device = await deviceByExternalId(ctx, assertIdentifier(args.deviceId, "deviceId"))
    if (device === null) return null
    return toDeviceRecord(device)
  },
})

/** Every device of one user, revoked ones included: the executor reports
 * DEVICE_REVOKED rather than DEVICE_OFFLINE when that is the only match. */
export const listForUser = query({
  args: { serviceToken: v.string(), userId: v.string() },
  returns: v.array(deviceRecordValidator),
  handler: async (ctx, args): Promise<DeviceRecord[]> => {
    requireService(ctx, args.serviceToken)
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(MAX_DEVICES_PER_USER)
    return devices.map(toDeviceRecord)
  },
})

/**
 * Relay presence. Revoked is terminal: a revoked row is left untouched rather
 * than throwing, so the relay's disconnect cleanup can never fail on it.
 */
export const setPresence = mutation({
  args: {
    serviceToken: v.string(),
    deviceId: v.string(),
    online: v.boolean(),
    capabilities: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    requireService(ctx, args.serviceToken)
    const device = await deviceByExternalId(ctx, assertIdentifier(args.deviceId, "deviceId"))
    // No id echo in the message: the caller already knows what it sent.
    if (device === null) fail("INVALID_INPUT", "Unknown device.")
    if (device.status === "revoked") return null
    await ctx.db.patch(device._id, {
      status: args.online ? "online" : "offline",
      lastSeenAt: Date.now(),
      ...(args.capabilities === undefined ? {} : { capabilities: args.capabilities }),
    })
    return null
  },
})
