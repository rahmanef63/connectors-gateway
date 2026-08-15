/**
 * Dashboard API key list. Scoped to the signed-in user by index, never by a
 * caller-supplied user id.
 *
 * The summary is a deliberate subset: `secretHash` is not in it, and there is
 * no query anywhere that returns it to a user. The raw key left the building
 * once, in the response to `mutations:issue`.
 */
import { v } from "convex/values"
import { query } from "../../_generated/server"
import type { Doc } from "../../_generated/dataModel"
import { requireUser } from "../../_shared/auth"
import { apiKeyStatusValidator } from "../../_shared/validators"
import { MAX_API_KEYS_PAGE } from "./limits"

export const apiKeySummaryValidator = v.object({
  keyId: v.string(),
  label: v.string(),
  status: apiKeyStatusValidator,
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
})

export type ApiKeySummary = {
  keyId: string
  label: string
  status: Doc<"apiKeys">["status"]
  createdAt: number
  lastUsedAt?: number
}

/** Revoked keys are listed too: the user needs to see what they turned off. */
export const listMine = query({
  args: {},
  returns: v.array(apiKeySummaryValidator),
  handler: async (ctx): Promise<ApiKeySummary[]> => {
    const userId = await requireUser(ctx)
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_API_KEYS_PAGE)
    return rows.map(toApiKeySummary)
  },
})

function toApiKeySummary(doc: Doc<"apiKeys">): ApiKeySummary {
  return {
    keyId: doc.keyId,
    label: doc.label,
    status: doc.status,
    // `_creationTime` is the row's own clock — nothing caller-supplied.
    createdAt: doc._creationTime,
    ...(doc.lastUsedAt === undefined ? {} : { lastUsedAt: doc.lastUsedAt }),
  }
}
