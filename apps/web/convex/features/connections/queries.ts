/**
 * Dashboard connection list. `tokenCipher` is not in the returned shape:
 * the browser has no use for sealed upstream credentials, so it never
 * receives them (docs/08 — never pass SaaS tokens outward).
 */
import { v } from "convex/values"
import { query } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import {
  connectionSummaryValidator,
  toConnectionSummary,
  type ConnectionSummary,
} from "../../_shared/connection-record"
import { MAX_CONNECTIONS_PER_OWNER } from "../../_shared/limits"

export const listMine = query({
  args: {},
  returns: v.array(connectionSummaryValidator),
  handler: async (ctx): Promise<ConnectionSummary[]> => {
    const userId = await requireUser(ctx)
    const connections = await ctx.db
      .query("connections")
      .withIndex("by_owner", (q) => q.eq("ownerType", "user").eq("ownerId", userId))
      .take(MAX_CONNECTIONS_PER_OWNER)
    return connections.map(toConnectionSummary)
  },
})
