/**
 * Policy rule wire shape — matches `PolicyRule` in `@cg/core`. The owner
 * (`userId`) is deliberately absent: scoping happens in the query, so a rule
 * that reaches `evaluatePolicy` is already the caller's own.
 */
import { type Infer, v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { policyDecisionValidator } from "./validators"

export const policyRuleValidator = v.object({
  connectorId: v.string(),
  actionId: v.string(),
  decision: policyDecisionValidator,
})

export type PolicyRuleRecord = Infer<typeof policyRuleValidator>

export function toPolicyRule(doc: Doc<"policyRules">): PolicyRuleRecord {
  return {
    connectorId: doc.connectorId,
    actionId: doc.actionId,
    decision: doc.decision,
  }
}
