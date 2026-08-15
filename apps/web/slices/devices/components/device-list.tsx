import type { TimestampFormatOptions } from "../lib/format"
import type { DeviceView, DevicesLabels } from "../types"
import { DeviceCard } from "./device-card"

export type DeviceListProps = {
  devices: readonly DeviceView[]
  labels: DevicesLabels
  dateFormat?: TimestampFormatOptions
}

/** Grid of device cards, or the empty state. No page chrome — the shell owns it. */
export function DeviceList({ devices, labels, dateFormat }: DeviceListProps) {
  if (devices.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">{labels.emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{labels.emptyDescription}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {devices.map((device) => (
        <DeviceCard key={device.deviceId} device={device} labels={labels} dateFormat={dateFormat} />
      ))}
    </div>
  )
}
