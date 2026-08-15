"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRenameDevice } from "../hooks/use-rename-device"
import type { DeviceView, DevicesLabels } from "../types"

export type DeviceRenameFieldProps = {
  device: DeviceView
  labels: DevicesLabels
  onDone: () => void
}

/** Inline rename. Identity never changes, only the display name (docs/04). */
export function DeviceRenameField({ device, labels, onDone }: DeviceRenameFieldProps) {
  const [value, setValue] = useState(device.displayName)
  const { renameDevice, pending } = useRenameDevice(labels)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const renamed = await renameDevice(device.deviceId, value)
    if (renamed) onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="flex-1 space-y-1 text-sm">
        <span className="text-xs font-medium text-muted-foreground">{labels.rename.label}</span>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={labels.rename.placeholder}
          disabled={pending}
          maxLength={120}
        />
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {labels.rename.submit}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
        {labels.rename.cancel}
      </Button>
    </form>
  )
}
