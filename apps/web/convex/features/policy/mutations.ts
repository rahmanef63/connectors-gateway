/**
 * Per-user policy rules — docs/09-policy-and-approvals.md.
 *
 * A rule is an upsert on (userId, connectorId, actionId). The user id comes
 * from the session, so a caller cannot write a rule into another user's
 * policy set, and `evaluatePolicy` still applies the risk-class baseline on
 * top: an explicit ALLOW never loosens an R4 action.
 */
import { v } from "convex/values"
import { mutation } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import { assertIdentifier } from "../../_shared/input"
import { MAX_POLICY_RULES_PER_USER } from "../../_shared/limits"
import { policyDecisionValidator } from "../../_shared/validators"

const WILDCARD_ACTION = "*"

export const setRule = mutation({
  args: {
    connectorId: v.string(),
    actionId: v.string(),
    decision: policyDecisionValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await requireUser(ctx)
    const connectorId = assertIdentifier(args.connectorId, "connectorId")
    const actionId =
      args.actionId === WILDCARD_ACTION
        ? WILDCARD_ACTION
        : assertActionId(args.actionId)

    const existing = await ctx.db
      .query("policyRules")
      .withIndex("by_user_connector", (q) =>
        q.eq("userId", userId).eq("connectorId", connectorId),
      )
      .take(MAX_POLICY_RULES_PER_USER)
    const match = existing.find((rule) => rule.actionId === actionId)

    if (match === undefined) {
      await ctx.db.insert("policyRules", {
        userId,
        connectorId,
        actionId,
        decision: args.decision,
      })
      return null
    }
    await ctx.db.patch(match._id, { decision: args.decision })
    return null
  },
})

/** Action ids are dotted (`scene.render`), so they need their own guard. */
function assertActionId(value: string): string {
  return value
    .split(".")
    .map((segment) => assertIdentifier(segment, "actionId"))
    .join(".")
}
