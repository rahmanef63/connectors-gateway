import type { Metadata } from "next"

import { AuditLogPanel } from "@/features/audit-log"
import { navTitleFor } from "@/components/shell/nav-items"

export const metadata: Metadata = { title: navTitleFor("/audit") }

const PAGE_SIZE = 25

/**
 * The only route that does not preload: the audit slice pages through
 * `usePaginatedQuery`, which has no server-side preload equivalent. It is still
 * a live Convex subscription, not a fetch in an effect.
 */
export default function AuditPage() {
  return (
    <>
      <AuditLogPanel
        pageSize={PAGE_SIZE}
        labels={{
          panelTitle: "Recent activity",
          panelDescription: "Newest first. Identifiers and outcomes only.",
        }}
      />
      <p className="mt-6 text-sm text-muted-foreground">
        Audit rows record identifiers and outcomes only — never action payloads, tokens or local
        file paths.
      </p>
    </>
  )
}
