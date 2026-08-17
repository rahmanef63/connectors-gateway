/**
 * Risk classes and decision vocabulary.
 * Source of truth: docs/03-security-model.md, docs/09-policy-and-approvals.md.
 */

export const RISK_CLASSES = ["R0", "R1", "R2", "R3", "R4"] as const
export type RiskClass = (typeof RISK_CLASSES)[number]

/** What a connector manifest may declare. A manifest is always one or the other. */
export const EXECUTOR_KINDS = ["cloud", "local"] as const
export type ExecutorKind = (typeof EXECUTOR_KINDS)[number]

/**
 * What an audit row may record — a wider set than a manifest may declare.
 *
 * A request refused before it resolved to a connector never reached an
 * executor, and writing `cloud` for it would be a lie in the one table that
 * exists to be trusted. `none` is that case, and it is why this union is not
 * `ExecutorKind`.
 */
export const AUDIT_EXECUTOR_KINDS = [...EXECUTOR_KINDS, "none"] as const
export type AuditExecutorKind = (typeof AUDIT_EXECUTOR_KINDS)[number]

export const AUTH_TYPES = ["none", "oauth2", "api_key", "bearer", "device", "custom"] as const
export type AuthType = (typeof AUTH_TYPES)[number]

export const POLICY_DECISIONS = ["ALLOW", "DENY", "REQUIRE_APPROVAL"] as const
export type PolicyDecision = (typeof POLICY_DECISIONS)[number]

/**
 * Default decision per risk class when no explicit user rule matches.
 * R4 (arbitrary code / shell) is DENY by default — AGENTS.md invariant 7.
 */
export const DEFAULT_RISK_DECISION: Readonly<Record<RiskClass, PolicyDecision>> = Object.freeze({
  R0: "ALLOW",
  R1: "ALLOW",
  R2: "REQUIRE_APPROVAL",
  R3: "REQUIRE_APPROVAL",
  R4: "DENY",
})

/** Restrictiveness ranking — the most restrictive decision always wins (docs/09). */
export const DECISION_RESTRICTIVENESS: Readonly<Record<PolicyDecision, number>> = Object.freeze({
  ALLOW: 0,
  REQUIRE_APPROVAL: 1,
  DENY: 2,
})

export function isRiskClass(value: unknown): value is RiskClass {
  return typeof value === "string" && (RISK_CLASSES as readonly string[]).includes(value)
}
