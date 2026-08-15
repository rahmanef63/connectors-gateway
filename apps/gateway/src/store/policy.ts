/**
 * PolicyStore backed by Convex. Rules are scoped to the authenticated user in
 * the query itself — @cg/policy receives an already-scoped list (PolicyRule
 * carries no owner field, so scoping cannot happen downstream).
 */
import type { PolicyRule, PolicyStore } from "@cg/core"
import type { ControlPlaneClient } from "./client"
import { toPolicyRules } from "./guards"
import { REFS } from "./refs"

export function createPolicyStore(client: ControlPlaneClient): PolicyStore {
  return {
    async listRules(userId: string, connectorId: string): Promise<PolicyRule[]> {
      return toPolicyRules(await client.query(REFS.policyListRules, { userId, connectorId }))
    },
  }
}
