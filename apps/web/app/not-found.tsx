import Link from "next/link"

import { FocusLayout } from "@/components/focus-layout"
import { DEFAULT_LANDING } from "@/lib/safe-redirect"

/**
 * Rendered outside the dashboard chrome (a 404 has no nav item, so the shell
 * would have no header to derive). Native elements on tokens — the eyebrow /
 * title / body / one action shape every focus screen wears.
 */
export default function NotFound() {
  return (
    <FocusLayout>
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          That address does not exist in this dashboard. If you followed a pairing link, check the
          code was not truncated — a pairing code is eight characters.
        </p>
        <Link href={DEFAULT_LANDING} className="btn-primary mt-6">
          Go to Devices
        </Link>
      </div>
    </FocusLayout>
  )
}
