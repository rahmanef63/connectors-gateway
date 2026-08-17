import type { ReactNode } from "react"

import { FocusLayout } from "@/components/focus-layout"

/**
 * Consent sits outside the dashboard chrome for the same reason pairing does:
 * it is one decision, reached from another application, and a sidebar full of
 * other things to click is a way to approve without reading.
 */
export default function AuthorizeLayout({ children }: { children: ReactNode }) {
  return <FocusLayout className="max-w-lg">{children}</FocusLayout>
}
