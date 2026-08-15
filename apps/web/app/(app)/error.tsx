"use client"

import { ErrorPanel } from "@/components/error-panel"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorPanel title="This screen failed to load" error={error} reset={reset} />
}
