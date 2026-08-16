/**
 * Step 5 of the pipeline: policy.
 *
 * Authorization is checked per ACTION, not once per connection (AGENTS.md
 * invariant 6), and the device-capability term is loaded only for local
 * connectors — a cloud action never has one to satisfy.
 */
import type { ActionDefinition, ConnectorManifest, PolicyDecision, Principal } from "@cg/core"
import { evaluatePolicy } from "@cg/policy"
import { announcedCapabilities } from "../capabilities"
import type { PipelineDeps } from "./types"

export async function decide(
  deps: PipelineDeps,
  principal: Principal,
  connector: ConnectorManifest,
  action: ActionDefinition,
): Promise<PolicyDecision> {
  const rules = await deps.policy.listRules(principal.userId, connector.id)
  const deviceCapabilities =
    connector.executor === "local"
      ? announcedCapabilities(await deps.devices.listForUser(principal.userId))
      : undefined

  const evaluation = evaluatePolicy({
    connector,
    action,
    rules,
    scopes: principal.scopes,
    ...(deviceCapabilities ? { deviceCapabilities } : {}),
  })

  if (evaluation.decision !== "ALLOW") {
    // `reason` is a closed vocabulary of machine tokens — safe to log verbatim.
    deps.logger.warn("policy denied action", {
      connectorId: connector.id,
      actionId: action.id,
      decision: evaluation.decision,
      reason: evaluation.reason,
    })
  }
  return evaluation.decision
}
