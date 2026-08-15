import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { api } from "@convex/_generated/api"
import { ConnectionsTable } from "./connections-table"
import { convexOptions } from "@/lib/convex-server"
import { navTitleFor } from "@/components/shell/nav-items"

export const metadata: Metadata = { title: navTitleFor("/connections") }

export default async function ConnectionsPage() {
  const preloaded = await preloadQuery(
    api.features.connections.queries.listMine,
    {},
    await convexOptions(),
  )

  return <ConnectionsTable preloaded={preloaded} />
}
