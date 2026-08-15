import { EmptyState } from "@/components/empty-state"
import type { TimestampFormatOptions } from "../lib/format"
import type { DeviceView, DevicesLabels } from "../types"
import { DeviceCard } from "./device-card"

export type DeviceListProps = {
  devices: readonly DeviceView[]
  labels: DevicesLabels
  dateFormat?: TimestampFormatOptions
}

/**
 * Grid of device cards, or the host's empty state. No page chrome — the shell
 * owns that. The empty copy tells the user how to get a machine here, which is
 * why it comes from `labels` and not from a hardcoded "No data".
 */
export function DeviceList({ devices, labels, dateFormat }: DeviceListProps) {
  if (devices.length === 0) {
    return <EmptyState title={labels.emptyTitle} description={labels.emptyDescription} />
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {devices.map((device) => (
        <DeviceCard key={device.deviceId} device={device} labels={labels} dateFormat={dateFormat} />
      ))}
    </div>
  )
}
