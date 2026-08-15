"use client"

import { useEffect, useId, useRef, useState } from "react"

import { Icon } from "@/components/shell/icons"
import { TONE_CLASSES, type Tone } from "@/components/status-badge"
import { cn } from "@/lib/cn"

/**
 * A read-only, copyable block. Only ever renders configuration that is safe to
 * display — the Setup screen passes placeholders where a secret would go.
 *
 * The confirmation reverts, so the button never lies about the state of the
 * clipboard, and a refused clipboard (permission, insecure origin) says so in
 * place instead of failing silently.
 */

/** Long enough to notice, short enough that the button is honest again fast. */
const REVERT_AFTER_MS = 1500

type CopyState = "idle" | "copied" | "failed"

const MESSAGES: Readonly<Record<CopyState, string>> = Object.freeze({
  idle: "",
  copied: "Copied",
  failed: "Copy failed — select the text and copy manually.",
})

/** Colour comes from the tone SSOT, never from a token named here. */
const MESSAGE_TONES: Readonly<Record<CopyState, Tone>> = Object.freeze({
  idle: "neutral",
  copied: "success",
  failed: "danger",
})

/** A labelled, read-only value with an icon-only copy button beside it. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [state, setState] = useState<CopyState>("idle")
  const labelId = useId()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current)
  }, [])

  function revertLater() {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState("idle"), REVERT_AFTER_MS)
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setState("copied")
    } catch {
      setState("failed")
    }
    revertLater()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="text-sm font-medium text-foreground">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {/* The confirmation is the only announcement: the button's own name
              stays "Copy <label>" so it never changes under a screen reader. */}
          <span
            role="status"
            aria-live="polite"
            className={cn("max-w-64 text-right text-xs", TONE_CLASSES[MESSAGE_TONES[state]].text)}
          >
            {MESSAGES[state]}
          </span>
          <button
            type="button"
            onClick={onCopy}
            aria-label={`Copy ${label}`}
            className="btn-ghost px-2 py-2"
          >
            <Icon name={state === "copied" ? "check" : "copy"} className="size-4" />
          </button>
        </div>
      </div>
      {/* Scrollable, so it must be reachable by keyboard; a named group rather
          than a bare <pre>, which drops the label for having no role.
          `bg-card-hover` because this always sits INSIDE a `.card` — `bg-card`
          would be the same surface as its parent and read as a stray rule. */}
      <pre
        role="group"
        aria-labelledby={labelId}
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-border bg-card-hover px-3 py-3 text-xs leading-relaxed text-foreground"
      >
        <code>{value}</code>
      </pre>
    </div>
  )
}
