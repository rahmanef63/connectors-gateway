import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { api } from "@convex/_generated/api"
import { ApprovalsTable } from "./approvals-table"
import { convexOptions } from "@/lib/convex-server"
import { navTitleFor } from "@/components/shell/nav-items"

export const metadata: Metadata = { title: navTitleFor("/approvals") }

export default async function ApprovalsPage() {
  const preloaded = await preloadQuery(
    api.features.approvals.queries.listPending,
    {},
    await convexOptions(),
  )

  return (
    <>
      <ApprovalsTable preloaded={preloaded} />
      <p className="mt-6 text-sm text-muted-foreground">
        Approving does not run anything. It authorises one call — that connector, that action,
        those exact arguments — once, and only until it expires. The agent&apos;s next attempt
        spends it; a different argument needs a new approval, so agreeing to delete one record is
        never agreement to delete another.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Approval is never implied by a read-only annotation on an action. A connector that
        mislabels a write as read-only does not skip this step.
      </p>
    </>
  )
}
