import type { Metadata } from "next"

import { NotBuiltYet } from "@/components/not-built-yet"
import { navTitleFor } from "@/components/shell/nav-items"

export const metadata: Metadata = { title: navTitleFor("/approvals") }

export default function ApprovalsPage() {
  return (
    <>
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
