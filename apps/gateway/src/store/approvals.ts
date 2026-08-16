/**
 * ApprovalStore backed by Convex — the persistence behind REQUIRE_APPROVAL.
 *
 * The gateway never decides whether something is approved; it asks, and the
 * answer is a single boolean that the same transaction has already spent.
 * Claiming is a mutation for that reason: "is it approved?" and "mark it used"
 * cannot be two calls, or two concurrent executions ride one human decision.
 */
import type { ControlPlaneClient } from "./client"
import { REFS } from "./refs"

export type ApprovalRequest = {
  ownerId: string
  connectorId: string
  actionId: string
  requestHash: string
  inputPreview: string
  risk: string
}

export type ApprovalStore = {
  /** True when an approval existed for exactly this call and was spent here. */
  claim(ownerId: string, requestHash: string): Promise<boolean>
  /** Put the call in front of a human. Never returns permission. */
  request(input: ApprovalRequest): Promise<void>
}

export function createApprovalStore(client: ControlPlaneClient): ApprovalStore {
  return {
    async claim(ownerId, requestHash) {
      // Convex responses are external input everywhere else in this folder;
      // a boolean is narrow enough to check inline.
      return (await client.mutation(REFS.approvalsClaim, { ownerId, requestHash })) === true
    },
    async request(input) {
      await client.mutation(REFS.approvalsRequest, input)
    },
  }
}
