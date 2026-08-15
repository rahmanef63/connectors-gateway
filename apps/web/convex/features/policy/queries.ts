/**
 * Dashboard policy list — every rule the signed-in user owns, across
 * connectors. `by_user_connector` is queried on its `userId` prefix.
 */
import { v } from "convex/values"
import { query } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import { MAX_POLICY_RULES_PER_USER } from "../../_shared/limits"
import {
  policyRuleValidator,
  toPolicyRule,
  type PolicyRuleRecord,
} from "../../_shared/policy_record"

export const listMine = query({
  args: {},
  returns: v.array(policyRuleValidator),
  handler: async (ctx): Promise<PolicyRuleRecord[]> => {
    const userId = await requireUser(ctx)
    const rules = await ctx.db
      .query("policyRules")
      .withIndex("by_user_connector", (q) => q.eq("userId", userId))
      .take(MAX_POLICY_RULES_PER_USER)
    return rules.map(toPolicyRule)
  },
})
