import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server"

import { AppShell } from "@/components/app-shell/app-shell"

/**
 * Defence in depth. proxy.ts is the real gate — a layout does not stop a nested
 * page from rendering — but this stops the chrome ever painting for a visitor
 * without a session, and every page still preloads with the caller's own token
 * so Convex authorizes independently.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await isAuthenticatedNextjs())) {
    redirect("/sign-in")
  }

  return <AppShell>{children}</AppShell>
}
