import type { PolicyDecision } from "@cg/core"
import { StatusBadge } from "@/components/status-badge"
import { toneForDecision } from "../config/tone"

export type DecisionBadgeProps = {
  decision: PolicyDecision
  /** Already-localised copy for this decision. */
  label: string
}

/**
 * ALLOW / DENY / REQUIRE_APPROVAL → tone → the app's badge, by lookup table.
 * The mapping lives in config/tone.ts; this component owns no colour and never
 * reads the decision string for anything but that lookup.
 */
export function DecisionBadge({ decision, label }: DecisionBadgeProps) {
  return <StatusBadge tone={toneForDecision(decision)}>{label}</StatusBadge>
}
