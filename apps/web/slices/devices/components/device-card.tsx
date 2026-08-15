"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

/** One paired machine: presence, announced adapters, rename and revoke. */
export function DeviceCard({ device, labels, dateFormat }: DeviceCardProps) {
  const [renaming, setRenaming] = useState(false)
  const revoked = device.status === "revoked"

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate">{device.displayName}</CardTitle>
            <CardDescription>
              {labels.platform[device.platform]} — {labels.lastSeenPrefix}{" "}
              {formatLastSeen(device.lastSeenAt, labels.lastSeenNever, dateFormat)}
            </CardDescription>
          </div>
          <DeviceStatusBadge status={device.status} label={labels.status[device.status]} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {renaming ? (
          <DeviceRenameField device={device} labels={labels} onDone={() => setRenaming(false)} />
        ) : null}
        <CapabilityList capabilities={device.capabilities} labels={labels} />
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setRenaming((current) => !current)}
          disabled={revoked}
        >
          {renaming ? labels.rename.cancel : labels.rename.action}
        </Button>
        <RevokeDeviceDialog device={device} labels={labels} disabled={revoked} />
      </CardFooter>
    </Card>
  )
}
