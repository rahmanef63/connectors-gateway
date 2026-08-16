/**
 * Answering an approval — docs/09-policy-and-approvals.md.
 *
 * Approving does NOT run anything. It marks one row usable, once, until it
 * expires; the agent's next attempt at that exact call spends it. Keeping the
 * decision and the execution apart is what stops this screen from becoming a
 * remote-execution button.
 */
import { v } from "convex/values"
import { mutation, type MutationCtx } from "../../_generated/server"
import type { Id } from "../../_generated/dataModel"
import { requireUser } from "../../_shared/auth"

async function resolve(
  ctx: MutationCtx,
  approvalId: Id<"approvals">,
  status: "approved" | "denied",
): Promise<null> {
  const userId = await requireUser(ctx)
  const row = await ctx.db.get(approvalId)
  // Same answer for someone else's row as for a missing one: a distinct
  // "forbidden" would confirm the id exists.
  if (row === null || row.ownerId !== userId) {
    throw new Error("Approval tidak ditemukan.")
  }
  if (row.status !== "pending") throw new Error("Approval sudah dijawab.")
  if (row.expiresAt <= Date.now()) throw new Error("Approval sudah kedaluwarsa.")
  await ctx.db.patch(approvalId, { status, resolvedAt: Date.now() })
  return null
}

export const approve = mutation({
  args: { approvalId: v.id("approvals") },
  returns: v.null(),
  handler: (ctx, args) => resolve(ctx, args.approvalId, "approved"),
})

export const deny = mutation({
  args: { approvalId: v.id("approvals") },
  returns: v.null(),
  handler: (ctx, args) => resolve(ctx, args.approvalId, "denied"),
})
