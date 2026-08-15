"use client"

import { TONE_CLASSES } from "@/components/status-badge"
import { cn } from "@/lib/cn"

/**
 * Shared error-boundary body. The caught error is NEVER rendered: a message can
 * carry a token, a Convex function path or a local filesystem path (P0). The
 * digest is a Next-generated correlation id and is safe to show.
 *
 * `reset` is optional — a boundary always has one, a static failure screen
 * (an unconfigured deployment, say) has nothing to retry.
 */
export function ErrorPanel({
  title,
  error,
  reset,
}: {
  title: string
  error: Error & { digest?: string }
  reset?: () => void
}) {
  return (
    <div className={cn("card mx-auto max-w-lg p-6", TONE_CLASSES.danger.border)}>
      <p
        className={cn(
          "text-xs font-medium uppercase tracking-wide",
          TONE_CLASSES.danger.text,
        )}
      >
        Error
      </p>
      <h2 className="mt-2 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Something went wrong on this screen. Nothing was changed by the failure.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        {error.digest ? (
          <>
            Reference: <code className="font-mono text-foreground">{error.digest}</code>
          </>
        ) : (
          "No reference id was produced for this failure."
        )}
      </p>
      {reset ? (
        <button type="button" onClick={reset} className="btn-primary mt-6">
          Try again
        </button>
      ) : null}
    </div>
  )
}
