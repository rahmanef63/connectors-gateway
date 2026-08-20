"use client"

// The sidebar's link list: NAV_GROUPS rendered as grouped <Link>s, led by the
// FAB — the same order the dock uses, so the two chromes never disagree about
// what the primary action is.
//
// DIVERGENCE from the template (deliberate, and the one that matters): its
// shell keeps the active screen in React state and renders <button>s. These are
// real Next routes, so every item is a <Link> and "active" is derived from
// usePathname() + navItemFor(). Never mirror the route into state — the two
// copies drift the moment someone navigates with the back button.
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Icon } from "./icons"
import { FAB, NAV_GROUPS, navItemFor, type NavItem as NavItemType } from "./nav-items"
import { cn } from "@/lib/cn"

export function SidebarNav() {
  const activeSlug = navItemFor(usePathname())?.slug

  return (
    <nav aria-label="Sections" className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <NavLink item={FAB} active={FAB.slug === activeSlug} />
      </div>
      {NAV_GROUPS.map((group) => {
        // The FAB is a normal member of its group in the registry (so the sheet
        // and the dock list it exactly once); the sidebar promotes it above the
        // groups, so skip it here rather than render it twice.
        const items = group.items.filter((item) => item.slug !== FAB.slug)
        if (items.length === 0) return null
        return (
          <div key={group.group} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {group.label}
            </p>
            {items.map((item) => (
              <NavLink key={item.slug} item={item} active={item.slug === activeSlug} />
            ))}
          </div>
        )
      })}
    </nav>
  )
}

function NavLink({ item, active }: { item: NavItemType; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-[transform,color,background-color] motion-safe:hover:translate-x-0.5",
        active
          ? "bg-accent/12 text-foreground"
          : "text-muted-foreground hover:bg-card-hover hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
          active && "text-accent",
        )}
      >
        <Icon name={item.icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  )
}
