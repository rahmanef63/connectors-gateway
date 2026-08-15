/**
 * Dashboard device list. Scoped to the signed-in user by index, not by a
 * caller-supplied user id — identity is never derived from arguments.
 */
import { v } from "convex/values"
import { query } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import {
  deviceSummaryValidator,
  toDeviceSummary,
  type DeviceSummary,
} from "../../_shared/device-record"
import { MAX_DEVICES_PER_USER } from "../../_shared/limits"

export const listMine = query({
  args: {},
  returns: v.array(deviceSummaryValidator),
  handler: async (ctx): Promise<DeviceSummary[]> => {
    const userId = await requireUser(ctx)
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_DEVICES_PER_USER)
    return devices.map(toDeviceSummary)
  },
})
