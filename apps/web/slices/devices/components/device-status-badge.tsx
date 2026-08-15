import type { DeviceStatus } from "@cg/core"
import { Badge } from "@/components/ui/badge"
import { badgeVariantForStatus } from "../config/status-tone"

export type DeviceStatusBadgeProps = {
  status: DeviceStatus
  /** Already-localised copy for this status. */
  label: string
}

/** Status → tone → variant, resolved by lookup table (see config/status-tone). */
export function DeviceStatusBadge({ status, label }: DeviceStatusBadgeProps) {
  return <Badge variant={badgeVariantForStatus(status)}>{label}</Badge>
}
