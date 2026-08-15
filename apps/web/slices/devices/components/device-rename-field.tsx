"use client"

import { useId, useState } from "react"
import type { FormEvent } from "react"
import { useRenameDevice } from "../hooks/use-rename-device"
import type { DeviceView, DevicesLabels } from "../types"

export type DeviceRenameFieldProps = {
  device: DeviceView
  labels: DevicesLabels
  onDone: () => void
}

/**
 * Inline rename. Identity never changes, only the display name (docs/04).
 *
 * A real `<label htmlFor>` rather than a wrapping element: the name has to
 * survive being read on its own by a screen reader, and `useId` keeps the pair
 * unique when several cards render the field at once.
 */
export function DeviceRenameField({ device, labels, onDone }: DeviceRenameFieldProps) {
  const [value, setValue] = useState(device.displayName)
  const { renameDevice, pending } = useRenameDevice(labels)
  const inputId = useId()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const renamed = await renameDevice(device.deviceId, value)
    if (renamed) onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1 space-y-1.5">
        <label htmlFor={inputId} className="block text-xs font-medium text-muted-foreground">
          {labels.rename.label}
        </label>
        <input
          id={inputId}
          className="field"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={labels.rename.placeholder}
          disabled={pending}
          maxLength={120}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {labels.rename.submit}
      </button>
      <button type="button" className="btn-ghost" onClick={onDone} disabled={pending}>
        {labels.rename.cancel}
      </button>
    </form>
  )
}
