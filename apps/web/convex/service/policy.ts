/**
 * Gateway-facing policy store — docs/09-policy-and-approvals.md.
 * "service/policy:listRules".
 *
 * Rules are scoped to the user here, because `PolicyRule` in `@cg/core`
 * carries no owner field: by the time a rule reaches `evaluatePolicy` it must
 * already be the right user's rule.
 */
import { v } from "convex/values"
import { query } from "../_generated/server"
import { requireService } from "../_shared/auth"
import { MAX_POLICY_RULES_PER_USER } from "../_shared/limits"
import { policyRuleValidator, toPolicyRule, type PolicyRuleRecord } from "../_shared/policy_record"

export const listRules = query({
  args: { serviceToken: v.string(), userId: v.string(), connectorId: v.string() },
  returns: v.array(policyRuleValidator),
  handler: async (ctx, args): Promise<PolicyRuleRecord[]> => {
    requireService(ctx, args.serviceToken)
    const rules = await ctx.db
      .query("policyRules")
      .withIndex("by_user_connector", (q) =>
        q.eq("userId", args.userId).eq("connectorId", args.connectorId),
      )
      .take(MAX_POLICY_RULES_PER_USER)
    return rules.map(toPolicyRule)
  },
})
