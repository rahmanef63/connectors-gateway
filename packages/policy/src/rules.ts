/**
 * Rule lookup. Rules come from the PolicyStore (a trust boundary), so every
 * entry is shape-checked before it can influence a decision.
 */
import type { PolicyRule } from "@cg/core"
import { rankDecision } from "./merge"

/** Matches every action of a connector. */
export const WILDCARD_ACTION = "*"

function isPolicyRule(value: unknown): value is PolicyRule {
  if (typeof value !== "object" || value === null) return false
  const rule = value as Partial<PolicyRule>
  return (
    typeof rule.connectorId === "string" &&
    typeof rule.actionId === "string" &&
    typeof rule.decision === "string"
  )
}

/**
 * Ties inside one specificity tier resolve to the most restrictive rule, so the
 * outcome does not depend on the order rules happen to come back from storage.
 */
function pickMostRestrictive(candidates: readonly PolicyRule[]): PolicyRule | undefined {
  let winner: PolicyRule | undefined
  for (const candidate of candidates) {
    if (!winner || rankDecision(candidate.decision) > rankDecision(winner.decision)) winner = candidate
  }
  return winner
}

/**
 * Precedence is specificity, never declaration order: an exact `actionId` rule
 * always beats a `*` rule, and a later rule never silently wins over an earlier one.
 */
export function matchRule(
  rules: readonly PolicyRule[],
  connectorId: string,
  actionId: string,
): PolicyRule | undefined {
  const source = Array.isArray(rules) ? rules : []
  const scoped = source.filter(isPolicyRule).filter((rule) => rule.connectorId === connectorId)

  const exact = scoped.filter((rule) => rule.actionId === actionId)
  if (exact.length > 0) return pickMostRestrictive(exact)

  return pickMostRestrictive(scoped.filter((rule) => rule.actionId === WILDCARD_ACTION))
}
