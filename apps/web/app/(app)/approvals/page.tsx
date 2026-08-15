import type { Metadata } from "next"

import { PageHeader } from "@/components/app-shell/page-header"
import { navItemFor } from "@/components/app-shell/nav-items"
import { NotBuiltYet } from "@/components/not-built-yet"

export const metadata: Metadata = { title: "Approvals" }

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        description={navItemFor("/approvals")?.description ?? ""}
      />
      <NotBuiltYet
        title="Pending approvals"
        blockedOn="The policy layer already returns REQUIRE_APPROVAL, but nothing persists that decision yet: there is no approval record, no expiry and no user-facing Convex function in the pinned contract. Until then an action needing approval is simply refused at call time rather than queued here."
      />
      <p className="mt-6 text-sm text-muted-foreground">
        Approval is never implied by a read-only annotation on an action. A connector that mislabels
        a write as read-only does not skip this step.
      </p>
    </>
  )
}
