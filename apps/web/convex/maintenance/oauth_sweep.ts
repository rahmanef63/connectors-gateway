/**
 * The sweeper for the two OAuth tables — docs/18-oauth.md "Still open".
 *
 * Both only ever grew. An authorization code nobody redeems expires but is
 * never deleted, and registration is open by design, so anyone on the internet
 * can add `oauthClients` rows at whatever rate `oauthLimiter` allows. Neither
 * was a correctness bug — a lapsed code is refused on read and a client row
 * grants nothing on its own — which is exactly why it would have gone unnoticed
 * until the table was the problem.
 *
 * `internalMutation`, so it is reachable from the cron and from nowhere else:
 * it deletes rows, and nothing outside this deployment should be able to ask.
 *
 * Every pass is BOUNDED. A sweeper that tries to catch up in one transaction is
 * how a cleanup job becomes the outage — it would hit Convex's transaction
 * limits on the exact deployment that most needs sweeping, fail, and retry
 * forever. Whatever is left over is simply swept on the next tick.
 */
import { v } from "convex/values"
import { internalMutation } from "../_generated/server"
import { OAUTH_CLIENT_IDLE_MS, OAUTH_SWEEP_BATCH } from "../_shared/limits"

export const sweep = internalMutation({
  args: {},
  returns: v.object({ codes: v.number(), clients: v.number() }),
  handler: async (ctx): Promise<{ codes: number; clients: number }> => {
    const now = Date.now()

    // Lapsed authorization codes. `redeemCode` already refuses these, so this
    // reclaims space rather than closing a hole — the row is dead either way.
    const lapsed = await ctx.db
      .query("oauthCodes")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(OAUTH_SWEEP_BATCH)
    for (const row of lapsed) await ctx.db.delete(row._id)

    // Clients that registered and never completed a single exchange. That is
    // the shape of scanner noise, and the ONLY shape safe to delete without
    // asking: a client with `lastUsedAt` set belongs to somebody, and deleting
    // it would break their next reconnect with "unknown client" — a failure
    // they could not diagnose and did not cause.
    const cutoff = now - OAUTH_CLIENT_IDLE_MS
    const stale = await ctx.db
      .query("oauthClients")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(OAUTH_SWEEP_BATCH)
    let clients = 0
    for (const row of stale) {
      if (row.lastUsedAt !== undefined) continue
      await ctx.db.delete(row._id)
      clients += 1
    }

    return { codes: lapsed.length, clients }
  },
})
