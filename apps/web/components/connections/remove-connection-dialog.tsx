"use client"

import { useId, useRef } from "react"
import type { MouseEvent, SyntheticEvent } from "react"

import { CONNECTIONS_COPY } from "./labels"
import { useRemoveConnection } from "./use-connections"

export type RemovableConnection = {
  connectorId: string
  baseUrl: string
}

/**
 * Destructive confirm on the platform's own `<dialog>` — same shape as the
 * device and API-key confirms: backdrop click closes, focus returns to the
 * trigger, and neither escape hatch fires while the mutation is in flight.
 */
export function RemoveConnectionDialog({ connection }: { connection: RemovableConnection }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const { removeConnection, pending } = useRemoveConnection()

  function close() {
    dialogRef.current?.close()
  }

  // Keyed by connector, which is the control plane's unit: one credential per
  // (owner, connector), so this removes the connection to that service.
  async function confirm() {
    if (await removeConnection(connection.connectorId)) close()
  }

  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (pending) return
    if (event.target === dialogRef.current) close()
  }

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (pending) event.preventDefault()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn-danger px-3 py-1.5 text-xs"
        aria-label={`${CONNECTIONS_COPY.remove.action} ${connection.connectorId}`}
        onClick={() => dialogRef.current?.showModal()}
      >
        {CONNECTIONS_COPY.remove.action}
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
          {CONNECTIONS_COPY.remove.title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {CONNECTIONS_COPY.remove.description}
        </p>
        <p className="mt-4 text-sm font-medium">{connection.connectorId}</p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
          {connection.baseUrl}
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={close} disabled={pending}>
            {CONNECTIONS_COPY.remove.cancel}
          </button>
          <button type="button" className="btn-danger" onClick={confirm} disabled={pending}>
            {pending ? CONNECTIONS_COPY.remove.pending : CONNECTIONS_COPY.remove.confirm}
          </button>
        </div>
      </dialog>
    </>
  )
}
