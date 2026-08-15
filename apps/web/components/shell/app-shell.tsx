"use client"

// THE ONE OUTER CHROME. Ported from template-convex-starter's app/os/os-shell.tsx:
// a full-height flex row — a collapsible <aside> that only exists from md up, and
// a scrolling <main> holding the topbar, the route-derived page header and the
// page — plus the mobile dock and the all-screens sheet.
//
// Pages render inside <main> and must not add a header, sidebar, page title or
// outer container of their own.
import { useState, type ReactNode } from "react"

import { Icon } from "./icons"
import { MoreSheet } from "./more-sheet"
import { NavUser } from "./nav-user"
import { OsDock } from "./os-dock"
import { PageHeader } from "./page-header"
import { SidebarNav } from "./sidebar-nav"
import { Topbar } from "./topbar"
import { cn } from "@/lib/cn"
import { SITE_NAME, SITE_ROLE } from "@/lib/site"

export function AppShell({ children, userLabel }: { children: ReactNode; userLabel?: string }) {
  // The two pieces of genuine UI state in the shell: everything else (which
  // screen is active) is derived from the route, never mirrored here.
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside
        // The topbar toggle points at this id with aria-controls, so a screen
        // reader can say *what* it expands. Renaming it breaks that link.
        id="os-sidebar"
        className={cn(
          "hidden w-64 shrink-0 flex-col border-r border-border bg-card/40 p-4",
          collapsed ? "md:hidden" : "md:flex",
        )}
      >
        {/* NO WORKSPACE SWITCHER — a decision, not an omission. The template
            has one because it has a `workspaces` table; this product has no
            workspaces (see convex/schema.ts), and a switcher over invented
            data would be fiction. The brand row holds the slot instead. */}
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
            <Icon name="shield" className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{SITE_NAME}</span>
            <span className="block truncate text-xs text-muted-foreground">{SITE_ROLE}</span>
          </span>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <SidebarNav />
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <NavUser email={userLabel} />
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-7">
        <Topbar collapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} />
        <PageHeader />
        {children}
        {/* Clears the fixed dock so the last row of a page is never under it. */}
        <div className="h-[calc(6rem+env(safe-area-inset-bottom))] md:hidden" />
      </main>

      <OsDock onOpenMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} email={userLabel} />
    </div>
  )
}
