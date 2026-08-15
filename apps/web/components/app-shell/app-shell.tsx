import type { ReactNode } from "react"

import { AppHeader } from "./app-header"
import { SidebarNav } from "./sidebar-nav"

/**
 * THE ONE OUTER CHROME. Slices and pages render inside `<main>` and must not
 * add a header, sidebar or page-level container of their own.
 */
export function AppShell({ children, userLabel }: { children: ReactNode; userLabel?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <AppHeader userLabel={userLabel} />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row md:gap-10 md:px-6 md:py-8">
        <SidebarNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
