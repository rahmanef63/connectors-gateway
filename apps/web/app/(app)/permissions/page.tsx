import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { api } from "@convex/_generated/api"
import { PermissionsTable } from "./permissions-table"
import { convexOptions } from "@/lib/convex-server"
import { navTitleFor } from "@/components/shell/nav-items"

export const metadata: Metadata = { title: navTitleFor("/permissions") }

export default async function PermissionsPage() {
  const preloaded = await preloadQuery(
    api.features.policy.queries.listMine,
    {},
    await convexOptions(),
  )

  return (
    <>
      <PermissionsTable preloaded={preloaded} />
      <p className="mt-6 text-sm text-muted-foreground">
        A rule here is a ceiling, not a guarantee. The gateway re-evaluates policy on every single
        call, and a device that has the capability disabled locally still refuses — the most
        restrictive decision wins.
      </p>
    </>
  )
}
