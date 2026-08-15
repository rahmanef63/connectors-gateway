/**
 * evaluatePolicy — the one function that turns
 * (connector + action + rules + scopes + device capabilities) into a decision.
 * It never throws: a caller that cannot be authorized gets DENY, not an exception.
 */
import { DEFAULT_RISK_DECISION, findAction, isRiskClass } from "@cg/core"
import type { PolicyDecision } from "@cg/core"
import { mostRestrictive, rankDecision } from "./merge"
import { hasAllCapabilities, hasAllScopes } from "./requirements"
import { matchRule } from "./rules"
import type { PolicyEvaluation, PolicyInput } from "./types"

export function evaluatePolicy(input: PolicyInput): PolicyEvaluation {
  const connector = input.connector

  // The manifest is the authority on risk and requirements. Re-resolving the
  // action by id stops a caller-supplied ActionDefinition from declaring
  // `python.execute` to be R0 with no required scopes.
  const action = findAction(connector, input.action.id)
  if (!action) return { decision: "DENY", reason: "unknown_action" }

  if (!hasAllScopes(action, input.scopes)) return { decision: "DENY", reason: "missing_scope" }

  if (!hasAllCapabilities(connector.id, action, input.deviceCapabilities)) {
    return { decision: "DENY", reason: "missing_capability" }
  }

  if (!isRiskClass(action.risk)) return { decision: "DENY", reason: "invalid_risk" }
  const baseline: PolicyDecision = DEFAULT_RISK_DECISION[action.risk]

  const matchedRule = matchRule(input.rules, connector.id, action.id)
  if (!matchedRule) return { decision: baseline, reason: "risk_default" }

  // AGENTS.md invariant 7: dangerous capabilities are disabled by default.
  // Merging most-restrictive-wins is what enforces it — an explicit ALLOW rule
  // can only ever tighten or match the risk baseline, never raise a
  // default-DENY R4 action above DENY. There is deliberately no override path.
  const decision = mostRestrictive(baseline, matchedRule.decision)

  // Report which input actually decided the outcome, for the audit trail.
  const ruleStands = rankDecision(matchedRule.decision) >= rankDecision(baseline)
  return { decision, reason: ruleStands ? "explicit_rule" : "risk_default", matchedRule }
}
