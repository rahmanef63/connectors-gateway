import type { ReactNode } from "react"

import { FocusLayout } from "@/components/focus-layout"

/**
 * Pairing sits outside the dashboard chrome on purpose: it is one decision,
 * reached from a link the local agent printed, and nothing else.
 */
export default function PairLayout({ children }: { children: ReactNode }) {
  return <FocusLayout className="max-w-lg">{children}</FocusLayout>
}
