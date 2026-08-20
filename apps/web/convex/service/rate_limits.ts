/**
 * Shared fixed-window rate buckets for the future multi-gateway topology.
 *
 * Production is still deliberately singleton. This transactional service exists
 * so enabling a second gateway later cannot silently multiply edge/OAuth/pairing
 * budgets. Keys are irreversible digests computed by the gateway; raw peer
 * addresses never enter Convex.
 */
import { v } from "convex/values"
import { mutation } from "../_generated/server"
import type { Doc } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { requireService } from "../_shared/auth"
import { fail } from "../_shared/errors"

const resultValidator = v.object({ allowed: v.boolean(), resetAt: v.number() })
const MAX_LIMIT = 10_000
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_BUCKETS_PER_KEY = 2

export const consume = mutation({
  args: {
    serviceToken: v.string(),
    bucket: v.string(),
    keyDigest: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  returns: resultValidator,
  handler: async (ctx, args): Promise<{ allowed: boolean; resetAt: number }> => {
    requireService(ctx, args.serviceToken)
    const bucket = assertBucket(args.bucket)
    const keyDigest = assertDigest(args.keyDigest)
    const limit = assertPositiveInteger(args.limit, MAX_LIMIT, "Rate limit")
    const windowMs = assertPositiveInteger(args.windowMs, MAX_WINDOW_MS, "Rate window")
    const now = Date.now()
    const rows = await rowsFor(ctx, bucket, keyDigest)
    if (rows.length > 1) fail("INTERNAL", "Rate bucket state is inconsistent.")
    const current = rows[0]

    if (current === undefined || current.resetAt <= now) {
      const resetAt = now + windowMs
      if (current === undefined) {
        await ctx.db.insert("rateLimitBuckets", { bucket, keyDigest, count: 1, resetAt })
      } else {
        await ctx.db.patch(current._id, { count: 1, resetAt })
      }
      return { allowed: true, resetAt }
    }

    if (current.count >= limit) return { allowed: false, resetAt: current.resetAt }
    await ctx.db.patch(current._id, { count: current.count + 1 })
    return { allowed: true, resetAt: current.resetAt }
  },
})

async function rowsFor(ctx: MutationCtx, bucket: string, keyDigest: string): Promise<Doc<"rateLimitBuckets">[]> {
  return await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_bucket_key", (q) => q.eq("bucket", bucket).eq("keyDigest", keyDigest))
    .take(MAX_BUCKETS_PER_KEY)
}

function assertBucket(value: string): string {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(value)) fail("INVALID_INPUT", "Rate bucket name is invalid.")
  return value
}

function assertDigest(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) fail("INVALID_INPUT", "Rate-limit key digest is invalid.")
  return value
}

function assertPositiveInteger(value: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail("INVALID_INPUT", `${label} is invalid.`)
  return value
}
