/**
 * Bounded cleanup for short-lived authorization and approval rows.
 *
 * Correctness never depends on this job: expired OAuth codes and approvals are
 * refused on read. The sweep reclaims storage, while also pruning dynamic OAuth
 * clients that registered long ago and never completed a single exchange.
 *
 * `internalMutation`, so only this deployment's cron may invoke it. Every read
 * is bounded; leftovers wait for the next hour rather than turning cleanup into
 * the largest transaction on the deployment that most needs it.
 */
import { v } from "convex/values"
import { internalMutation } from "../_generated/server"
import {
  APPROVAL_SWEEP_BATCH,
  OAUTH_CLIENT_IDLE_MS,
  OAUTH_SWEEP_BATCH,
  RATE_LIMIT_SWEEP_BATCH,
  RELAY_ROUTE_SWEEP_BATCH,
} from "../_shared/limits"

export const sweep = internalMutation({
  args: {},
  returns: v.object({ codes: v.number(), clients: v.number(), approvals: v.number(), rateBuckets: v.number(), relayRoutes: v.number() }),
  handler: async (ctx): Promise<{ codes: number; clients: number; approvals: number; rateBuckets: number; relayRoutes: number }> => {
    const now = Date.now()

    const lapsedCodes = await ctx.db
      .query("oauthCodes")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
      .take(OAUTH_SWEEP_BATCH)
    for (const row of lapsedCodes) await ctx.db.delete(row._id)

    // A client with `lastUsedAt` belongs to somebody and must never be pruned:
    // deleting it would break their next reconnect with an opaque unknown-client
    // failure. Only scanner-shaped registrations that were never used qualify.
    const cutoff = now - OAUTH_CLIENT_IDLE_MS
    const staleClients = await ctx.db
      .query("oauthClients")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(OAUTH_SWEEP_BATCH)
    let clients = 0
    for (const row of staleClients) {
      if (row.lastUsedAt !== undefined) continue
      await ctx.db.delete(row._id)
      clients += 1
    }

    // Any approval status is safe to delete after expiry. Pending and approved
    // rows are already unusable; denied/consumed rows have finished their job.
    const lapsedApprovals = await ctx.db
      .query("approvals")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
      .take(APPROVAL_SWEEP_BATCH)
    for (const row of lapsedApprovals) await ctx.db.delete(row._id)

    const lapsedRateBuckets = await ctx.db
      .query("rateLimitBuckets")
      .withIndex("by_resetAt", (q) => q.lte("resetAt", now))
      .take(RATE_LIMIT_SWEEP_BATCH)
    for (const row of lapsedRateBuckets) await ctx.db.delete(row._id)

    const lapsedRelayRoutes = await ctx.db
      .query("relayRoutes")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
      .take(RELAY_ROUTE_SWEEP_BATCH)
    for (const row of lapsedRelayRoutes) await ctx.db.delete(row._id)

    return {
      codes: lapsedCodes.length,
      clients,
      approvals: lapsedApprovals.length,
      rateBuckets: lapsedRateBuckets.length,
      relayRoutes: lapsedRelayRoutes.length,
    }
  },
})
