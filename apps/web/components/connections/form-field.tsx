"use client"

import { CONNECT_ERRORS, type ConnectErrorCode } from "./labels"

import type { ReactNode } from "react"

import { TONE_CLASSES } from "@/components/status-badge"
import { cn } from "@/lib/cn"

/**
 * Label + control + one line of help, where the help line BECOMES the error
 * when there is one. One line either way, so a rejected field does not push the
 * rest of the form down the page — and `aria-describedby` on the control points
 * at that same line whichever it is currently saying.
 */
export function FormField({
  id,
  errorId,
  label,
  hint,
  error,
  children,
}: {
  id: string
  errorId: string
  label: string
  hint: string
  error: string | null
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      <p
        id={errorId}
        className={cn(
          "text-xs leading-relaxed",
          error === null ? "text-muted-foreground" : TONE_CLASSES.danger.text,
        )}
      >
        {error ?? hint}
      </p>
    </div>
  )
}

/** The one place a connect error is rendered, so both halves of the panel
 *  report failure identically. */
export function FormError({ code }: { code: ConnectErrorCode | null }) {
  if (code === null) return null
  return (
    <p role="alert" className={cn("text-sm leading-relaxed", TONE_CLASSES.danger.text)}>
      {CONNECT_ERRORS[code]}
    </p>
  )
}
