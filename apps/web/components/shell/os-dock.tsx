"use client"

// Mobile bottom dock (hidden on md+). Five slots around a raised centre action:
// [tab0][tab1][FAB][tab2][Menu]. Tabs are DOCK_TABS (the first three workspace
// screens), the FAB is Setup — the one thing a new account must do — and Menu
// opens the all-screens sheet. Same registry the sidebar reads, so the two can
// never list different screens.
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Icon } from "./icons"
import { DOCK_TABS, FAB, navItemFor, type NavItem } from "./nav-items"
import { cn } from "@/lib/cn"

export function OsDock({ onOpenMore }: { onOpenMore: () => void }) {
  // Route-derived active state — see sidebar-nav.tsx.
  const activeSlug = navItemFor(usePathname())?.slug
  const fabActive = activeSlug === FAB.slug
  const moreActive = !fabActive && !DOCK_TABS.some((tab) => tab.slug === activeSlug)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.6rem)] pt-2 md:hidden">
      <nav
        aria-label="App dock"
        className="pointer-events-auto mx-auto grid max-w-md grid-cols-5 items-end rounded-2xl border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur"
      >
        <DockTab item={DOCK_TABS[0]} activeSlug={activeSlug} />
        <DockTab item={DOCK_TABS[1]} activeSlug={activeSlug} />

        <div className="flex flex-col items-center">
          <Link
            href={FAB.href}
            aria-label={FAB.label}
            aria-current={fabActive ? "page" : undefined}
            className="-mt-7 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg ring-4 ring-background transition-transform motion-safe:active:scale-95"
          >
            <Icon name={FAB.icon} className="h-6 w-6" />
          </Link>
          {/* The link above already carries this as its accessible name; left
              exposed it would be announced a second time as orphan text. */}
          <span
            aria-hidden
            className={cn(
              "mt-1 text-[10px] font-medium",
              fabActive ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {FAB.label}
          </span>
        </div>

        <DockTab item={DOCK_TABS[2]} activeSlug={activeSlug} />

        <button
          type="button"
          // The visible word is "Menu", so the accessible name has to start with
          // it — WCAG 2.5.3, or voice control can't target this button.
          aria-label="Menu — all apps"
          aria-current={moreActive ? "page" : undefined}
          onClick={onOpenMore}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors",
            moreActive
              ? "bg-accent/12 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon name="more" className={cn("h-6 w-6", moreActive && "text-accent")} />
          <span>Menu</span>
        </button>
      </nav>
    </div>
  )
}

// One dock slot. A missing item still renders an empty cell so the grid keeps
// its 5 columns and the FAB stays centred however few tabs the registry yields.
function DockTab({ item, activeSlug }: { item: NavItem | undefined; activeSlug?: string }) {
  if (!item) return <span aria-hidden />
  const active = item.slug === activeSlug
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors",
        active ? "bg-accent/12 text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon name={item.icon} className={cn("h-6 w-6", active && "text-accent")} />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  )
}
