/**
 * The single place restrictiveness is decided (docs/09: "the most restrictive
 * decision wins"). Every other layer — cloud rules, local agent allowlist,
 * risk baseline — folds through here instead of comparing decisions itself.
 */
import { DECISION_RESTRICTIVENESS, POLICY_DECISIONS } from "@cg/core"
import type { PolicyDecision } from "@cg/core"

export function isPolicyDecision(value: unknown): value is PolicyDecision {
  return typeof value === "string" && (POLICY_DECISIONS as readonly string[]).includes(value)
}

/**
 * Rank of a decision. A value that is not part of the decision vocabulary
 * (a hand-edited or legacy stored rule, e.g. lowercase `deny`) is ranked as
 * DENY: an unreadable rule must never be the reason something was allowed.
 */
export function rankDecision(decision: PolicyDecision): number {
  return isPolicyDecision(decision) ? DECISION_RESTRICTIVENESS[decision] : DECISION_RESTRICTIVENESS.DENY
}

/** DENY beats REQUIRE_APPROVAL beats ALLOW. Commutative and associative by construction. */
export function mostRestrictive(...decisions: readonly PolicyDecision[]): PolicyDecision {
  // No decisions at all is no evidence of permission, so fail closed.
  if (decisions.length === 0) return "DENY"

  let winner: PolicyDecision = "ALLOW"
  for (const raw of decisions) {
    const candidate: PolicyDecision = isPolicyDecision(raw) ? raw : "DENY"
    if (rankDecision(candidate) > rankDecision(winner)) winner = candidate
  }
  return winner
}
