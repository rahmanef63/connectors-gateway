import type { PolicyDecision } from "@cg/core"
import { Badge } from "@/components/ui/badge"
import { badgeVariantForDecision } from "../config/tone"

export type DecisionBadgeProps = {
  decision: PolicyDecision
  /** Already-localised copy for this decision. */
  label: string
}

/** ALLOW / DENY / REQUIRE_APPROVAL → tone → variant, by lookup table. */
export function DecisionBadge({ decision, label }: DecisionBadgeProps) {
  return <Badge variant={badgeVariantForDecision(decision)}>{label}</Badge>
}
