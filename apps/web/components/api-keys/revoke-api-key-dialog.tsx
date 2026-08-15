"use client"

import { useId, useRef } from "react"
import type { MouseEvent, SyntheticEvent } from "react"

import { API_KEYS_COPY } from "./labels"
import { keyReference } from "./format"
import { useRevokeApiKey } from "./use-api-keys"
import type { ApiKeyView } from "./read"

/**
 * Destructive confirm on the platform's own `<dialog>` — no dialog library.
 * `showModal()` supplies the top layer, the inert background, the focus trap
 * and Esc; this adds the three things the element does not decide: a backdrop
 * click closes, focus returns to the trigger, and neither escape hatch fires
 * mid-flight, so the confirmation cannot vanish before the outcome is known.
 *
 * Mirrors `slices/devices/components/revoke-device-dialog.tsx` deliberately —
 * two destructive confirms in one product should behave identically.
 */
export function RevokeApiKeyDialog({ view }: { view: ApiKeyView }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const { revokeKey, pending } = useRevokeApiKey()

  function close() {
    dialogRef.current?.close()
  }

  async function confirm() {
    if (await revokeKey(view.keyId)) close()
  }

  /** A click on the backdrop targets the <dialog>; one inside targets a child. */
  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (pending) return
    if (event.target === dialogRef.current) close()
  }

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (pending) event.preventDefault()
  }

  const name = view.label === "" ? API_KEYS_COPY.list.unnamed : view.label

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn-danger px-3 py-1.5 text-xs"
        aria-label={`${API_KEYS_COPY.revoke.action} ${name}`}
        onClick={() => dialogRef.current?.showModal()}
      >
        {API_KEYS_COPY.revoke.action}
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
          {API_KEYS_COPY.revoke.title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {API_KEYS_COPY.revoke.description}
        </p>
        <p className="mt-4 text-sm font-medium">{name}</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{keyReference(view.keyId)}</p>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={close} disabled={pending}>
            {API_KEYS_COPY.revoke.cancel}
          </button>
          <button type="button" className="btn-danger" onClick={confirm} disabled={pending}>
            {pending ? API_KEYS_COPY.revoke.pending : API_KEYS_COPY.revoke.confirm}
          </button>
        </div>
      </dialog>
    </>
  )
}
