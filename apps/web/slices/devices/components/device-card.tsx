"use client"

import { useState } from "react"
import { formatLastSeen } from "../lib/format"
import type { TimestampFormatOptions } from "../lib/format"
import type { DeviceView, DevicesLabels } from "../types"
import { CapabilityList } from "./capability-list"
import { DeviceRenameField } from "./device-rename-field"
import { DeviceStatusBadge } from "./device-status-badge"
import { RevokeDeviceDialog } from "./revoke-device-dialog"

export type DeviceCardProps = {
  device: DeviceView
  labels: DevicesLabels
  dateFormat?: TimestampFormatOptions
}

/**
 * One paired machine: presence, announced adapters, rename and revoke.
 *
 * `.card` (rounded-2xl, one border, the card surface) and the shared spacing
 * register — nothing here names a colour or a radius of its own, so the card
 * re-themes with the app.
 */
export function DeviceCard({ device, labels, dateFormat }: DeviceCardProps) {
  const [renaming, setRenaming] = useState(false)
  const revoked = device.status === "revoked"

  return (
    <article className="card flex flex-col gap-5 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-base font-medium text-foreground">{device.displayName}</h3>
          <p className="text-sm text-muted-foreground">
            {labels.platform[device.platform]} — {labels.lastSeenPrefix}{" "}
            {formatLastSeen(device.lastSeenAt, labels.lastSeenNever, dateFormat)}
          </p>
        </div>
        <DeviceStatusBadge status={device.status} label={labels.status[device.status]} />
      </header>

      {renaming ? (
        <DeviceRenameField device={device} labels={labels} onDone={() => setRenaming(false)} />
      ) : null}

      <CapabilityList capabilities={device.capabilities} labels={labels} />

      <footer className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setRenaming((current) => !current)}
          disabled={revoked}
        >
          {renaming ? labels.rename.cancel : labels.rename.action}
        </button>
        <RevokeDeviceDialog device={device} labels={labels} disabled={revoked} />
      </footer>
    </article>
  )
}
