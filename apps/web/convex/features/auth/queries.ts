/**
 * The signed-in user's own identity, for the shell's account row.
 *
 * Deliberately narrow: an email and nothing else. The account row does not need
 * a name, an avatar or a role, and a query that returns the whole user document
 * would ship whatever @convex-dev/auth stores there to the client forever.
 */
import { v } from "convex/values"
import { query } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"

export const viewer = query({
  args: {},
  returns: v.object({ email: v.union(v.string(), v.null()) }),
  handler: async (ctx): Promise<{ email: string | null }> => {
    const userId = await requireUser(ctx)
    const user = await ctx.db.get(userId)
    return { email: typeof user?.email === "string" ? user.email : null }
  },
})
