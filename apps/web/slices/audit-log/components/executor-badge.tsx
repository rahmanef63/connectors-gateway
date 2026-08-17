import type { AuditExecutorKind } from "@cg/core"
import { StatusBadge } from "@/components/status-badge"
import { toneForExecutor } from "../config/tone"

export type ExecutorBadgeProps = {
  executor: AuditExecutorKind
  /** Already-localised copy for this executor. */
  label: string
}

/**
 * Where the action ran: cloud adapter or a paired local device. Both are
 * neutral — the label says which, the colour says nothing (see config/tone.ts).
 */
export function ExecutorBadge({ executor, label }: ExecutorBadgeProps) {
  return <StatusBadge tone={toneForExecutor(executor)}>{label}</StatusBadge>
}
