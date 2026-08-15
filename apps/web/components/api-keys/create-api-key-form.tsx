"use client"

import { useId, useState } from "react"
import type { FormEvent } from "react"

import { API_KEYS_COPY } from "./labels"
import { useIssueApiKey } from "./use-api-keys"
import type { IssuedKey } from "./read"

/**
 * Label in, key out. The key itself is handed to the caller and never held
 * here — this component keeps nothing but the text of the name field.
 */
export function CreateApiKeyForm({ onIssued }: { onIssued: (key: IssuedKey) => void }) {
  const [label, setLabel] = useState("")
  const { issueKey, pending } = useIssueApiKey()
  const inputId = useId()
  const hintId = useId()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const issued = await issueKey(label)
    if (issued === null) return
    setLabel("")
    onIssued(issued)
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1 space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
          {API_KEYS_COPY.create.label}
        </label>
        <input
          id={inputId}
          name="label"
          className="field"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={API_KEYS_COPY.create.placeholder}
          aria-describedby={hintId}
          autoComplete="off"
          maxLength={64}
          disabled={pending}
        />
        <p id={hintId} className="text-xs text-muted-foreground">
          {API_KEYS_COPY.create.hint}
        </p>
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? API_KEYS_COPY.create.pending : API_KEYS_COPY.create.submit}
      </button>
    </form>
  )
}
