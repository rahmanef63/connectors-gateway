"use client"

import { useId, useRef } from "react"
import type { MouseEvent, SyntheticEvent } from "react"
import { useRevokeDevice } from "../hooks/use-revoke-device"
import type { DeviceView, DevicesLabels } from "../types"

export type RevokeDeviceDialogProps = {
  device: DeviceView
  labels: DevicesLabels
  disabled?: boolean
  onRevoked?: () => void
}

/**
 * Destructive confirm on the platform's own `<dialog>` — no dialog library.
 *
 * `showModal()` is what makes it modal: the top layer, the inert background,
 * the focus trap and Esc-to-close are the browser's, not ours. What this file
 * adds is the three things the element does not decide for you — a backdrop
 * click closes, focus returns to the trigger on every exit path, and neither
 * escape hatch fires while the mutation is in flight, so the confirmation can
 * never disappear before the user learns whether the revoke landed.
 *
 * The mutation itself lives in `use-revoke-device`; this file owns open/closed.
 */
export function RevokeDeviceDialog({ device, labels, disabled, onRevoked }: RevokeDeviceDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const { revokeDevice, pending } = useRevokeDevice(labels)

  function close() {
    dialogRef.current?.close()
  }

  async function confirm() {
    const revoked = await revokeDevice(device.deviceId)
    if (!revoked) return
    close()
    onRevoked?.()
  }

  /** A click on the backdrop targets the <dialog>; a click inside targets a child. */
  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (pending) return
    if (event.target === dialogRef.current) close()
  }

  /** `cancel` is Esc. Refusing it mid-flight keeps the pending state visible. */
  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (pending) event.preventDefault()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn-danger"
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
      >
        {labels.revoke.action}
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
        <h2 id={titleId} className="text-base font-semibold">
          {labels.revoke.title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {labels.revoke.description}
        </p>
        <p className="mt-4 text-sm font-medium">{device.displayName}</p>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={close} disabled={pending}>
            {labels.revoke.cancel}
          </button>
          <button type="button" className="btn-danger" onClick={confirm} disabled={pending}>
            {pending ? labels.revoke.pending : labels.revoke.confirm}
          </button>
        </div>
      </dialog>
    </>
  )
}
