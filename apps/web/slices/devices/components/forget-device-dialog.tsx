"use client"

import { useId, useRef } from "react"
import type { MouseEvent, SyntheticEvent } from "react"
import { useForgetDevice } from "../hooks/use-forget-device"
import type { DeviceView, DevicesLabels } from "../types"

export type ForgetDeviceDialogProps = {
  device: DeviceView
  labels: DevicesLabels
}

/** Final destructive step after revocation; the server enforces that ordering too. */
export function ForgetDeviceDialog({ device, labels }: ForgetDeviceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const { forgetDevice, pending } = useForgetDevice(labels)

  function close() {
    dialogRef.current?.close()
  }

  async function confirm() {
    const forgotten = await forgetDevice(device.deviceId)
    if (forgotten) close()
  }

  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (!pending && event.target === dialogRef.current) close()
  }

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (pending) event.preventDefault()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn-danger"
        onClick={() => dialogRef.current?.showModal()}
      >
        {labels.forget.action}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={onBackdropClick}
        onCancel={onCancel}
        onClose={() => triggerRef.current?.focus()}
        className="card m-auto w-[min(28rem,calc(100vw-2rem))] p-6 text-foreground backdrop:bg-black/60"
      >
        <h2 id={titleId} className="text-base font-semibold">{labels.forget.title}</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {labels.forget.description}
        </p>
        <p className="mt-4 text-sm font-medium">{device.displayName}</p>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={close} disabled={pending}>
            {labels.forget.cancel}
          </button>
          <button type="button" className="btn-danger" onClick={confirm} disabled={pending}>
            {pending ? labels.forget.pending : labels.forget.confirm}
          </button>
        </div>
      </dialog>
    </>
  )
}
