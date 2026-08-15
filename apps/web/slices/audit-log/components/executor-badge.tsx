import type { ExecutorKind } from "@cg/core"
import { Badge } from "@/components/ui/badge"
import { badgeVariantForExecutor } from "../config/tone"

export type ExecutorBadgeProps = {
  executor: ExecutorKind
  /** Already-localised copy for this executor. */
  label: string
}

/** Where the action ran: cloud adapter or a paired local device. */
export function ExecutorBadge({ executor, label }: ExecutorBadgeProps) {
  return <Badge variant={badgeVariantForExecutor(executor)}>{label}</Badge>
}
