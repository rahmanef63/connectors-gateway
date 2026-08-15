"use client"

import { ErrorPanel } from "@/components/error-panel"

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <ErrorPanel title="This page failed to load" error={error} reset={reset} />
    </div>
  )
}
