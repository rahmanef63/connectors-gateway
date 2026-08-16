import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { connectionFunctions, CONNECT_ERRORS, type ConnectErrorCode } from "@/components/connections"
import { ConnectionsView, type ConnectNotice } from "./connections-view"
import { catalogEntries } from "@/lib/catalog"
import { convexOptions } from "@/lib/convex-server"
import { oauthRedirectUri } from "@/lib/app-origin"
import { navTitleFor } from "@/components/shell/nav-items"

export const metadata: Metadata = { title: navTitleFor("/connections") }

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Preloaded with the caller's own token, so Convex resolves the identity and
  // authorizes the read — the page never asserts whose connections these are.
  const preloaded = await preloadQuery(connectionFunctions.listMine, {}, await convexOptions())

  // Read on the server: the catalog is derived from the shipped manifests and
  // pulls in schema validation, which has no business in a browser bundle.
  const catalog = catalogEntries()

  return (
    <ConnectionsView
      preloaded={preloaded}
      catalog={catalog}
      redirectUri={oauthRedirectUri()}
      notice={noticeFrom(await searchParams, catalog)}
    />
  )
}

/**
 * The OAuth callback reports its outcome in the query string, so a refresh of
 * this page cannot resubmit anything. Both values are attacker-supplied: the
 * connector id is only ever matched against the catalog, and the error code
 * against the copy table, so an unknown value renders nothing rather than
 * echoing back whatever was in the URL.
 */
function noticeFrom(
  params: Record<string, string | string[] | undefined>,
  catalog: readonly { id: string; name: string }[],
): ConnectNotice {
  const connected = typeof params["connected"] === "string" ? params["connected"] : null
  if (connected !== null) {
    const entry = catalog.find((item) => item.id === connected)
    return entry === undefined ? null : { kind: "connected", name: entry.name }
  }
  const error = typeof params["connect_error"] === "string" ? params["connect_error"] : null
  if (error !== null && Object.hasOwn(CONNECT_ERRORS, error)) {
    return { kind: "error", code: error as ConnectErrorCode }
  }
  return null
}
