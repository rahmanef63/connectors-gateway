/**
 * Durable singleton lease for the current gateway topology.
 *
 * This does not pretend the relay is horizontally scalable. It enforces the
 * opposite: exactly one gateway may serve while socket routing, rate limits and
 * replay state remain process-local. Every operation is authenticated, holder
 * bound and transactional in Convex.
 */
import {
  GATEWAY_LEASE_NAME,
  GATEWAY_LEASE_TTL_MS,
} from "@cg/core"
import { v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { mutation } from "../_generated/server"
import type { MutationCtx } from "../_generated/server"
import { requireService } from "../_shared/auth"
import { fail } from "../_shared/errors"

const leaseResultValidator = v.object({ acquired: v.boolean(), expiresAt: v.number() })
const renewalResultValidator = v.object({ renewed: v.boolean(), expiresAt: v.number() })
const releaseResultValidator = v.object({ released: v.boolean() })

export const acquire = mutation({
  args: { serviceToken: v.string(), holderId: v.string() },
  returns: leaseResultValidator,
  handler: async (ctx, args): Promise<{ acquired: boolean; expiresAt: number }> => {
    requireService(ctx, args.serviceToken)
    const holderId = assertHolderId(args.holderId)
    const now = Date.now()
    const expiresAt = now + GATEWAY_LEASE_TTL_MS
    const current = await currentLease(ctx)

    if (current === undefined) {
      await ctx.db.insert("gatewayLeases", {
        leaseName: GATEWAY_LEASE_NAME,
        holderId,
        acquiredAt: now,
        renewedAt: now,
        expiresAt,
      })
      return { acquired: true, expiresAt }
    }

    if (current.holderId === holderId) {
      await ctx.db.patch(current._id, { renewedAt: now, expiresAt })
      return { acquired: true, expiresAt }
    }

    if (current.expiresAt <= now) {
      await ctx.db.patch(current._id, {
        holderId,
        acquiredAt: now,
        renewedAt: now,
        expiresAt,
      })
      return { acquired: true, expiresAt }
    }

    return { acquired: false, expiresAt: current.expiresAt }
  },
})

export const renew = mutation({
  args: { serviceToken: v.string(), holderId: v.string() },
  returns: renewalResultValidator,
  handler: async (ctx, args): Promise<{ renewed: boolean; expiresAt: number }> => {
    requireService(ctx, args.serviceToken)
    const holderId = assertHolderId(args.holderId)
    const now = Date.now()
    const current = await currentLease(ctx)

    // A late heartbeat may not silently reacquire. Once the previous lease
    // expired there was a window in which another process was entitled to win;
    // this process must stop and perform a fresh startup acquisition instead.
    if (
      current === undefined ||
      current.holderId !== holderId ||
      current.expiresAt <= now
    ) {
      return { renewed: false, expiresAt: current?.expiresAt ?? now }
    }

    const expiresAt = now + GATEWAY_LEASE_TTL_MS
    await ctx.db.patch(current._id, { renewedAt: now, expiresAt })
    return { renewed: true, expiresAt }
  },
})

export const release = mutation({
  args: { serviceToken: v.string(), holderId: v.string() },
  returns: releaseResultValidator,
  handler: async (ctx, args): Promise<{ released: boolean }> => {
    requireService(ctx, args.serviceToken)
    const holderId = assertHolderId(args.holderId)
    const current = await currentLease(ctx)
    if (current === undefined || current.holderId !== holderId) {
      return { released: false }
    }
    await ctx.db.delete(current._id)
    return { released: true }
  },
})

async function currentLease(ctx: MutationCtx): Promise<Doc<"gatewayLeases"> | undefined> {
  const rows = await ctx.db
    .query("gatewayLeases")
    .withIndex("by_name", (q) => q.eq("leaseName", GATEWAY_LEASE_NAME))
    .take(2)
  if (rows.length > 1) {
    // Unique indexes do not exist in Convex. Serializable acquisition prevents
    // normal duplicates; fail closed if manual data repair ever violated it.
    fail("INTERNAL", "Gateway lease state is inconsistent.")
  }
  return rows[0]
}

function assertHolderId(value: string): string {
  if (!/^gw_[A-Za-z0-9_-]{16,96}$/.test(value)) {
    fail("INVALID_INPUT", "Gateway holder id is invalid.")
  }
  return value
}
