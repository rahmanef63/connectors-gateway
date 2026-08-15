/**
 * Policy evaluation vocabulary — docs/09-policy-and-approvals.md.
 * The decision vocabulary itself lives in @cg/core (POLICY_DECISIONS).
 */
import type { ActionDefinition, ConnectorManifest, PolicyDecision, PolicyRule } from "@cg/core"

export type PolicyInput = {
  connector: ConnectorManifest
  action: ActionDefinition
  /** Rules configured by the owner of the connector, from the PolicyStore. */
  rules: PolicyRule[]
  /** Scopes granted to the calling principal. */
  scopes: string[]
  /** Capabilities announced by the paired device, namespaced `<connectorId>:<capability>`. */
  deviceCapabilities?: string[]
}

/**
 * Why a decision was reached. This string is written to the audit log verbatim,
 * so it is a closed vocabulary of machine tokens — never a scope name, action
 * argument, capability name or any other caller-supplied data.
 */
export const POLICY_REASONS = [
  "risk_default",
  "explicit_rule",
  "missing_scope",
  "missing_capability",
  "unknown_action",
  "invalid_risk",
] as const

export type PolicyReason = (typeof POLICY_REASONS)[number]

export type PolicyEvaluation = {
  decision: PolicyDecision
  reason: PolicyReason
  /** The rule that participated in the decision, if one matched. Present even when the risk baseline overrode it. */
  matchedRule?: PolicyRule
}
