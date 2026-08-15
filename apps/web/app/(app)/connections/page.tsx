import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { connectionFunctions } from "@/components/connections"
import { ConnectionsView } from "./connections-view"
import { convexOptions } from "@/lib/convex-server"
import { navTitleFor } from "@/components/shell/nav-items"

export const metadata: Metadata = { title: navTitleFor("/connections") }

export default async function ConnectionsPage() {
  // Preloaded with the caller's own token, so Convex resolves the identity and
  // authorizes the read — the page never asserts whose connections these are.
  const preloaded = await preloadQuery(connectionFunctions.listMine, {}, await convexOptions())

  return <ConnectionsView preloaded={preloaded} />
}
