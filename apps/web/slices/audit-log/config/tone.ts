/**
 * Decision / executor / status vocabularies → semantic tone → badge variant.
 * Lookup tables, never an if-chain: extending `PolicyDecision` or
 * `ExecutorKind` in @cg/core makes this file fail to typecheck.
 */
import type { ExecutorKind, PolicyDecision } from "@cg/core"
import type { AuditStatus, BadgeVariant, Tone } from "../types"

export const DECISION_TONES: Readonly<Record<PolicyDecision, Tone>> = Object.freeze({
  ALLOW: "positive",
  REQUIRE_APPROVAL: "warning",
  DENY: "danger",
})

export const EXECUTOR_TONES: Readonly<Record<ExecutorKind, Tone>> = Object.freeze({
  cloud: "neutral",
  local: "muted",
})

export const STATUS_TONES: Readonly<Record<AuditStatus, Tone>> = Object.freeze({
  success: "positive",
  error: "danger",
})

export const TONE_BADGE_VARIANTS: Readonly<Record<Tone, BadgeVariant>> = Object.freeze({
  positive: "success",
  neutral: "outline",
  muted: "secondary",
  warning: "warning",
  danger: "destructive",
})

export function badgeVariantForDecision(decision: PolicyDecision): BadgeVariant {
  return TONE_BADGE_VARIANTS[DECISION_TONES[decision]]
}

export function badgeVariantForExecutor(executor: ExecutorKind): BadgeVariant {
  return TONE_BADGE_VARIANTS[EXECUTOR_TONES[executor]]
}

export function badgeVariantForStatus(status: AuditStatus): BadgeVariant {
  return TONE_BADGE_VARIANTS[STATUS_TONES[status]]
}
