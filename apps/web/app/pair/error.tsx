"use client"

import { ErrorPanel } from "@/components/error-panel"

export default function PairError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorPanel title="Pairing could not be loaded" error={error} reset={reset} />
}
