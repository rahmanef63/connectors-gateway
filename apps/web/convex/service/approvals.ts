/**
 * Gateway-facing approval store — docs/09-policy-and-approvals.md.
 * "service/approvals:claim" and "service/approvals:request".
 *
 * The policy layer decides REQUIRE_APPROVAL; these two functions are what turn
 * that decision into something a human can act on and the gateway can trust
 * once. Everything here is keyed by `requestHash`, which the gateway computes
 * over the connector, the action and the canonicalised input — so an approval
 * authorises one call with one set of arguments, and nothing else.
 */
import { v } from "convex/values"
import { mutation } from "../_generated/server"
import { requireService } from "../_shared/auth"
import {
  APPROVAL_TTL_MS,
  MAX_IDENTIFIER_LENGTH,
  MAX_INPUT_PREVIEW_LENGTH,
  MAX_PENDING_APPROVALS_PER_OWNER,
} from "../_shared/limits"

/**
 * Spend an approval, if one is waiting for exactly this call.
 *
 * A mutation rather than a query because claiming is a WRITE: the row moves to
 * `consumed` in the same transaction that answers "yes". Reading first and
 * marking later would let two concurrent calls both see `approved` and both
 * proceed on one human decision.
 */
export const claim = mutation({
  args: {
    serviceToken: v.string(),
    ownerId: v.string(),
    requestHash: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    requireService(ctx, args.serviceToken)
    const row = await ctx.db
      .query("approvals")
      .withIndex("by_owner_hash", (q) =>
        q.eq("ownerId", args.ownerId).eq("requestHash", args.requestHash),
      )
      .first()

    if (row === null) return false
    if (row.status !== "approved") return false
    // Expiry is checked here, not by a sweeper: a row nobody read is not a row
    // anybody may spend, whatever a cleanup job's schedule happens to be.
    if (row.expiresAt <= Date.now()) return false

    await ctx.db.patch(row._id, { status: "consumed", resolvedAt: Date.now() })
    return true
  },
})

/**
 * Record that a call is waiting on a human, and return nothing the caller could
 * mistake for permission.
 *
 * Idempotent per `requestHash`: an agent that retries a refused call must not
 * fill the approval screen with identical rows, and re-requesting must never
 * revive a row the user already denied — that would turn "no" into "ask again
 * until yes".
 */
export const request = mutation({
  args: {
    serviceToken: v.string(),
    ownerId: v.string(),
    connectorId: v.string(),
    actionId: v.string(),
    requestHash: v.string(),
    inputPreview: v.string(),
    risk: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    requireService(ctx, args.serviceToken)
    if (
      args.connectorId.length > MAX_IDENTIFIER_LENGTH ||
      args.actionId.length > MAX_IDENTIFIER_LENGTH
    ) {
      throw new Error("Identifier too long.")
    }

    const now = Date.now()
    const existing = await ctx.db
      .query("approvals")
      .withIndex("by_owner_hash", (q) =>
        q.eq("ownerId", args.ownerId).eq("requestHash", args.requestHash),
      )
      .first()

    if (existing !== null) {
      // A denial stands until it expires. Only a stale row is refreshed, so a
      // retry loop cannot walk a decision backwards.
      if (existing.status === "pending" && existing.expiresAt > now) return null
      if (existing.status === "denied" && existing.expiresAt > now) return null
      await ctx.db.patch(existing._id, {
        status: "pending",
        requestedAt: now,
        expiresAt: now + APPROVAL_TTL_MS,
        resolvedAt: undefined,
      })
      return null
    }

    // A caller that can trigger REQUIRE_APPROVAL can trigger it in a loop, so
    // the queue is bounded. Oldest pending rows go first: they are the ones the
    // user has already declined to answer.
    const pending = await ctx.db
      .query("approvals")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", args.ownerId).eq("status", "pending"))
      .take(MAX_PENDING_APPROVALS_PER_OWNER + 1)
    if (pending.length > MAX_PENDING_APPROVALS_PER_OWNER) {
      const oldest = pending.sort((a, b) => a.requestedAt - b.requestedAt)[0]
      if (oldest !== undefined) await ctx.db.delete(oldest._id)
    }

    await ctx.db.insert("approvals", {
      ownerId: args.ownerId,
      connectorId: args.connectorId,
      actionId: args.actionId,
      requestHash: args.requestHash,
      inputPreview: args.inputPreview.slice(0, MAX_INPUT_PREVIEW_LENGTH),
      risk: args.risk,
      status: "pending",
      requestedAt: now,
      expiresAt: now + APPROVAL_TTL_MS,
    })
    return null
  },
})
