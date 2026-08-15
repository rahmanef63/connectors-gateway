/**
 * Decision / executor / status vocabularies → semantic tone.
 *
 * This file is the map's home: nothing else in the slice may look at a decision
 * string, and no component branches on one inline. The tone it yields is the
 * app's own vocabulary (`@/components/status-badge`), which resolves it to
 * classes — so the slice decides *meaning* and the design system decides colour.
 *
 * Lookup tables, never an if-chain: extending `PolicyDecision` or `ExecutorKind`
 * in @cg/core makes this file fail to typecheck rather than fall through to a
 * default and paint a denial like an allow.
 */
import type { ExecutorKind, PolicyDecision } from "@cg/core"
import type { AuditStatus, Tone } from "../types"

export const DECISION_TONES: Readonly<Record<PolicyDecision, Tone>> = Object.freeze({
  ALLOW: "success",
  REQUIRE_APPROVAL: "warning",
  DENY: "danger",
})

/**
 * Where the action ran is not a verdict: cloud and local are both neutral, and
 * the label carries the difference. Toning one of them would read as a warning
 * about a device that did nothing wrong.
 */
export const EXECUTOR_TONES: Readonly<Record<ExecutorKind, Tone>> = Object.freeze({
  cloud: "neutral",
  local: "neutral",
})

export const STATUS_TONES: Readonly<Record<AuditStatus, Tone>> = Object.freeze({
  success: "success",
  error: "danger",
})

export function toneForDecision(decision: PolicyDecision): Tone {
  return DECISION_TONES[decision]
}

export function toneForExecutor(executor: ExecutorKind): Tone {
  return EXECUTOR_TONES[executor]
}

export function toneForStatus(status: AuditStatus): Tone {
  return STATUS_TONES[status]
}
