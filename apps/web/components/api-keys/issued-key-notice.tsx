"use client"

import { CopyField } from "@/components/copy-field"
import { TONE_CLASSES } from "@/components/status-badge"
import { cn } from "@/lib/cn"
import { API_KEYS_COPY } from "./labels"
import type { IssuedKey } from "./read"

/**
 * The one and only sighting of a raw key.
 *
 * The value arrives as a prop from the page's own state and is gone the moment
 * that state is cleared or the user navigates away: it is never written to
 * storage, never put in the URL, and the control plane keeps only its hash. The
 * copy says all three of those things, because a user who closes this without
 * copying has lost the key for good.
 *
 * `aria-live="assertive"`: this interrupts on purpose. It is the one moment on
 * the screen where waiting politely could cost someone their only copy.
 */
export function IssuedKeyNotice({
  issued,
  onDismiss,
}: {
  issued: IssuedKey
  onDismiss: () => void
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn("card p-5", TONE_CLASSES.warning.border)}
    >
      <p className={cn("text-sm font-semibold", TONE_CLASSES.warning.text)}>
        {API_KEYS_COPY.reveal.title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {API_KEYS_COPY.reveal.body}
      </p>
      <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">
        {API_KEYS_COPY.reveal.danger}
      </p>

      <div className="mt-4">
        <CopyField label={API_KEYS_COPY.reveal.field} value={issued.token} />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {API_KEYS_COPY.reveal.configNotice}
      </p>
      <button type="button" className="btn-ghost mt-4" onClick={onDismiss}>
        {API_KEYS_COPY.reveal.dismiss}
      </button>
    </div>
  )
}
