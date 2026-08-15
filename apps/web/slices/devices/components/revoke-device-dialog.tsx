"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useRevokeDevice } from "../hooks/use-revoke-device"
import type { DeviceView, DevicesLabels } from "../types"

export type RevokeDeviceDialogProps = {
  device: DeviceView
  labels: DevicesLabels
  disabled?: boolean
  onRevoked?: () => void
}

/**
 * Destructive confirm. The mutation lives in `use-revoke-device`; this file only
 * owns open/closed state.
 *
 * ponytail: one dialog at every breakpoint. A true ResponsiveDialog swaps to a
 * bottom drawer under `sm`; that needs a drawer primitive (vaul), which is not
 * a declared dependency. Upgrade path: keep this API, swap the two imports.
 */
export function RevokeDeviceDialog({ device, labels, disabled, onRevoked }: RevokeDeviceDialogProps) {
  const [open, setOpen] = useState(false)
  const { revokeDevice, pending } = useRevokeDevice(labels)

  async function confirm() {
    const revoked = await revokeDevice(device.deviceId)
    if (!revoked) return
    setOpen(false)
    onRevoked?.()
  }

  return (
    <>
      <Button variant="destructive" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        {labels.revoke.action}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.revoke.title}</DialogTitle>
            <DialogDescription>{labels.revoke.description}</DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">{device.displayName}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {labels.revoke.cancel}
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? labels.revoke.pending : labels.revoke.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
