"use client"

import { ErrorPanel } from "@/components/error-panel"
import { FocusLayout } from "@/components/focus-layout"

/**
 * Root boundary: it replaces the whole page, chrome included, so it wears the
 * focus layout rather than floating in a bare centred div. ErrorPanel shows the
 * digest only — the caught error is never rendered (it can carry a token or a
 * local path).
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <FocusLayout className="max-w-lg">
      <ErrorPanel title="This page failed to load" error={error} reset={reset} />
    </FocusLayout>
  )
}
