import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { api } from "@convex/_generated/api"
import { ConnectionsTable } from "./connections-table"
import { PageHeader } from "@/components/app-shell/page-header"
import { navItemFor } from "@/components/app-shell/nav-items"
import { convexOptions } from "@/lib/convex-server"

export const metadata: Metadata = { title: "Connections" }

export default async function ConnectionsPage() {
  const preloaded = await preloadQuery(
    api.features.connections.queries.listMine,
    {},
    await convexOptions(),
  )

  return (
    <>
      <PageHeader
        title="Connections"
        description={navItemFor("/connections")?.description ?? ""}
      />
      <ConnectionsTable preloaded={preloaded} />
    </>
  )
}
