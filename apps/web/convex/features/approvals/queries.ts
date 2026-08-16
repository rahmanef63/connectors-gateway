/**
 * The approval screen's data — docs/09-policy-and-approvals.md.
 *
 * Scoped by session, never by an argument: an approval names a call somebody
 * is about to make with their credentials, so "whose queue is this" cannot be
 * something the caller gets to say.
 */
import { v } from "convex/values"
import { query } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import { MAX_PENDING_APPROVALS_PER_OWNER } from "../../_shared/limits"

export const listPending = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("approvals"),
      connectorId: v.string(),
      actionId: v.string(),
      inputPreview: v.string(),
      risk: v.string(),
      requestedAt: v.number(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUser(ctx)
    const now = Date.now()
    const rows = await ctx.db
      .query("approvals")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", userId).eq("status", "pending"))
      .take(MAX_PENDING_APPROVALS_PER_OWNER)
    return rows
      // An expired row is not actionable: approving it would produce a token
      // the gateway refuses anyway, which reads as the screen being broken.
      .filter((r) => r.expiresAt > now)
      .sort((a, b) => b.requestedAt - a.requestedAt)
      .map((r) => ({
        id: r._id,
        connectorId: r.connectorId,
        actionId: r.actionId,
        inputPreview: r.inputPreview,
        risk: r.risk,
        requestedAt: r.requestedAt,
        expiresAt: r.expiresAt,
      }))
  },
})
