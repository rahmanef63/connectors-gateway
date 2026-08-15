"use client"

// Slim bar inside <main>, above the page header. Left: the desktop-only sidebar
// toggle + a breadcrumb (group / screen). Right: the theme picker.
//
// The template also parks a Search button here. Nothing in this app searches
// yet, so it is not rendered — a control that does nothing is worse than a
// missing one.
import { usePathname } from "next/navigation"

import { Icon } from "./icons"
import { GROUP_LABEL, navItemFor } from "./nav-items"
import { ThemePicker } from "./theme-picker"

export function Topbar({
  collapsed,
  onToggleSidebar,
}: {
  collapsed: boolean
  onToggleSidebar: () => void
}) {
  // Active screen comes from the route, never from state — see sidebar-nav.tsx.
  const item = navItemFor(usePathname())

  return (
    <div className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          aria-expanded={!collapsed}
          // The <aside id="os-sidebar"> in app-shell.tsx — aria-expanded alone
          // never says which element it expands.
          aria-controls="os-sidebar"
          className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-border-hover hover:text-foreground md:inline-grid"
        >
          <Icon name="panel-left" className="h-4 w-4" />
        </button>
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-1.5 text-sm">
            <Crumb>{item ? GROUP_LABEL[item.group] : "Dashboard"}</Crumb>
            {item ? <Sep /> : null}
            {item ? <Crumb current>{item.label}</Crumb> : null}
          </ol>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ThemePicker />
      </div>
    </div>
  )
}

function Crumb({ children, current }: { children: React.ReactNode; current?: boolean }) {
  return (
    <li className="min-w-0">
      <span
        aria-current={current ? "page" : undefined}
        className={
          current
            ? "block truncate font-medium text-foreground"
            : "hidden truncate text-muted-foreground sm:block"
        }
      >
        {children}
      </span>
    </li>
  )
}

function Sep() {
  return (
    <li aria-hidden className="hidden text-muted-foreground/50 sm:block">
      /
    </li>
  )
}
