"use client"

import { ErrorPanel } from "@/components/error-panel"

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorPanel title="Sign-in is unavailable" error={error} reset={reset} />
}
