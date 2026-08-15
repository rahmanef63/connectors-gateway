import type { ReactNode } from "react"

import { FocusLayout } from "@/components/focus-layout"

/** No app chrome here — the shell only exists behind a session. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <FocusLayout>{children}</FocusLayout>
}
