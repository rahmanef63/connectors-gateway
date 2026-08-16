/**
 * The LOCAL capability allowlist — independent of cloud policy (docs/03
 * "defense in depth", docs/09 "the most restrictive decision wins").
 *
 * A job only reaches this file because the gateway already decided ALLOW.
 * That decision is treated as one vote, not as authority: a compromised or
 * mis-configured gateway must not imply unlimited local execution.
 */
import { isRiskClass } from "@cg/core"
import type { ActionDefinition, PolicyDecision } from "@cg/core"
import { GatewayError } from "@cg/core"
import type { AvailableIndex } from "./adapters"
import { qualifyCapability } from "./adapters"

/**
 * Substrings that are never runnable on this device, whatever the gateway says
 * (AGENTS.md invariant 7). Deliberately substring-matched and deliberately
 * over-broad: a false deny is a support ticket, a false allow is a shell.
 */
export const FORBIDDEN_ACTION_TOKENS: readonly string[] = Object.freeze([
  "python",
  "shell",
  "filesystem",
])

export const ALLOWLIST_REASONS = [
  "allowed",
  "forbidden_capability",
  "unknown_action",
  "high_risk",
  "missing_capability",
  "user_disabled",
] as const
export type AllowlistReason = (typeof ALLOWLIST_REASONS)[number]

export type AllowlistInput = {
  connectorId: string
  actionId: string
  /** Resolved from a REGISTERED adapter's manifest, never from the job envelope. */
  action: ActionDefinition | undefined
  available: AvailableIndex
  disabledActions: readonly string[]
}

export type AllowlistDecision = {
  decision: PolicyDecision
  reason: AllowlistReason
}

export function evaluateLocalAllowlist(input: AllowlistInput): AllowlistDecision {
  // 1. Always-denied capabilities first: this branch must not depend on a
  //    manifest lookup, so a rogue manifest cannot smuggle `python.execute` in.
  if (isForbiddenActionId(input.connectorId, input.actionId)) {
    return deny("forbidden_capability")
  }

  // 2. The action must exist in a registered adapter's manifest.
  const action = input.action
  if (action === undefined || action.id !== input.actionId) return deny("unknown_action")

  // 3. R4 (arbitrary code / shell) is never runnable here. An unreadable risk
  //    class fails closed for the same reason.
  if (!isRiskClass(action.risk) || action.risk === "R4") return deny("high_risk")

  // 4. Every required capability must be reported available right now.
  const required = (action.requiredCapabilities ?? []).map((capability) =>
    qualifyCapability(input.connectorId, capability),
  )
  if (required.length === 0) {
    if (!input.available.connectors.has(input.connectorId)) return deny("missing_capability")
  } else if (!required.every((capability) => input.available.capabilities.has(capability))) {
    return deny("missing_capability")
  }

  // 5. The user's own switch. Cloud ALLOW + local disabled = DENY.
  if (input.disabledActions.includes(input.actionId)) return deny("user_disabled")

  return { decision: "ALLOW", reason: "allowed" }
}

/** Throws NOT_AUTHORIZED for anything the local device refuses to run. */
export function assertLocallyAllowed(input: AllowlistInput): void {
  const result = evaluateLocalAllowlist(input)
  if (result.decision === "ALLOW") return
  // The reason is a fixed token, never caller-supplied text.
  throw new GatewayError("NOT_AUTHORIZED", `This device does not allow this action (${result.reason}).`)
}

export function isForbiddenActionId(connectorId: string, actionId: string): boolean {
  const haystack = `${connectorId}.${actionId}`.toLowerCase()
  return FORBIDDEN_ACTION_TOKENS.some((token) => haystack.includes(token))
}

function deny(reason: AllowlistReason): AllowlistDecision {
  return { decision: "DENY", reason }
}
