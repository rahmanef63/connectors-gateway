import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { fetchQuery } from "convex/nextjs"
import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server"

import { api } from "@convex/_generated/api"
import { AppShell } from "@/components/shell"
import { convexOptions } from "@/lib/convex-server"

/**
 * Defence in depth. proxy.ts is the real gate — a layout does not stop a nested
 * page from rendering — but this stops the chrome ever painting for a visitor
 * without a session, and every page still preloads with the caller's own token
 * so Convex authorizes independently.
 *
 * Stays a server component: AppShell is the "use client" boundary, so the whole
 * page tree below is not dragged into the client bundle by this file.
 *
 * The account row is named from `features/auth/queries:viewer`, fetched with the
 * caller's own token so Convex resolves the identity — the layout never asserts
 * who the user is. A read that cannot fail the page: if it throws (expired
 * token mid-render), the shell falls back to its honest "Signed in" label
 * rather than bouncing someone out of a page they are authorised for.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await isAuthenticatedNextjs())) {
    redirect("/sign-in")
  }

  const viewer = await fetchQuery(api.features.auth.queries.viewer, {}, await convexOptions()).catch(
    () => null,
  )

  return <AppShell userLabel={viewer?.email ?? undefined}>{children}</AppShell>
}
