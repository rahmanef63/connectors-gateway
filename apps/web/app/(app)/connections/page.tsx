import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { connectionFunctions } from "@/components/connections"
import { ConnectionsView } from "./connections-view"
import { catalogEntries } from "@/lib/catalog"
import { convexOptions } from "@/lib/convex-server"
import { navTitleFor } from "@/components/shell/nav-items"

export const metadata: Metadata = { title: navTitleFor("/connections") }

export default async function ConnectionsPage() {
  // Preloaded with the caller's own token, so Convex resolves the identity and
  // authorizes the read — the page never asserts whose connections these are.
  const preloaded = await preloadQuery(connectionFunctions.listMine, {}, await convexOptions())

  // Read on the server: the catalog is derived from the shipped manifests and
  // pulls in schema validation, which has no business in a browser bundle.
  const catalog = catalogEntries()

  return <ConnectionsView preloaded={preloaded} catalog={catalog} />
}
