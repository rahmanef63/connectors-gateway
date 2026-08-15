import type { DeviceStatus } from "@cg/core"
import { StatusBadge } from "@/components/status-badge"
import { toneForStatus } from "../config/status-tone"

export type DeviceStatusBadgeProps = {
  status: DeviceStatus
  /** Already-localised copy for this status. */
  label: string
}

/**
 * Status → tone by lookup table (see `config/status-tone`), tone → colour by the
 * host's `StatusBadge`. The slice keeps the mapping because only it knows that
 * `revoked` is the alarming one; it keeps no class name, so a device pill can
 * never drift from the connection and policy pills beside it.
 */
export function DeviceStatusBadge({ status, label }: DeviceStatusBadgeProps) {
  return <StatusBadge tone={toneForStatus(status)}>{label}</StatusBadge>
}
