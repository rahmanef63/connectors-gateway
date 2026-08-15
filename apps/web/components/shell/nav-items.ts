// SSOT for the shell's navigation. ONE list drives the sidebar groups, the
// mobile dock, the "all screens" sheet, the topbar breadcrumb and every page
// header. Adding a screen is one entry here plus its `app/(app)/<slug>/page.tsx`
// — nothing else needs touching, and nothing can drift out of sync.
//
// Ported from template-convex-starter's components/os/menu.ts, with one
// adaptation: that shell keeps the active screen in React state, this one uses
// real Next routes, so an item carries an `href` and "active" is derived from
// the pathname.
import type { IconName } from "./icons"

/** Sidebar grouping. The page header shows this as its eyebrow. */
export type NavGroup = "workspace" | "system"

export type NavItem = {
  slug: string
  href: string
  label: string
  /** One line of "what is this screen for" — page header + sheet subtitle. */
  sub: string
  icon: IconName
  group: NavGroup
}

/**
 * The raised centre action of the mobile dock, and the item the sidebar leads
 * with. Connecting an AI client is the one thing a new account must do, so it
 * gets the primary slot; it sits outside the groups below for the same reason
 * the template's Assistant does.
 */
export const FAB: NavItem = {
  slug: "setup",
  href: "/setup",
  label: "Setup",
  sub: "Copy-ready configuration for connecting an AI client.",
  icon: "sparkle",
  group: "system",
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    slug: "devices",
    href: "/devices",
    label: "Devices",
    sub: "Paired local machines, what they can do, and how to cut them off.",
    icon: "laptop",
    group: "workspace",
  },
  {
    slug: "connections",
    href: "/connections",
    label: "Connections",
    sub: "Cloud services this account has authorised the gateway to call.",
    icon: "plug",
    group: "workspace",
  },
  {
    slug: "audit",
    href: "/audit",
    label: "Audit",
    sub: "Who ran what, where it executed, and how policy decided.",
    icon: "search",
    group: "workspace",
  },
  {
    slug: "permissions",
    href: "/permissions",
    label: "Permissions",
    sub: "Per-action policy. The most restrictive decision always wins.",
    icon: "key",
    group: "system",
  },
  {
    slug: "approvals",
    href: "/approvals",
    label: "Approvals",
    sub: "Actions held for a human decision before they run.",
    icon: "check",
    group: "system",
  },
  FAB,
]

/** Eyebrow copy per group — a lookup, so a new group cannot fall through. */
export const GROUP_LABEL: Readonly<Record<NavGroup, string>> = {
  workspace: "Workspace",
  system: "System",
}

const byGroup = (group: NavGroup): NavItem[] => NAV_ITEMS.filter((item) => item.group === group)

/** Sidebar sections, derived. The Setup action leads the list, as in the dock. */
export const NAV_GROUPS: readonly { group: NavGroup; label: string; items: NavItem[] }[] = [
  { group: "workspace", label: GROUP_LABEL.workspace, items: byGroup("workspace") },
  { group: "system", label: GROUP_LABEL.system, items: byGroup("system") },
]

/**
 * The dock's three flanking tabs (the FAB takes the centre, "Menu" the last
 * slot). Derived from the workspace group so the dock can never list a screen
 * the sidebar does not have.
 */
export const DOCK_TABS: readonly NavItem[] = byGroup("workspace").slice(0, 3)

/**
 * Every screen's route, as a matcher pattern including its nested paths. The
 * auth gate (proxy.ts) reads this instead of restating the list, so a screen
 * added to the registry cannot ship ungated because someone forgot the second
 * edit.
 */
export const NAV_ROUTE_PATTERNS: readonly string[] = NAV_ITEMS.map((item) => `${item.href}(.*)`)

/**
 * Longest-prefix match, so a nested route like /devices/abc still resolves to
 * the Devices item. Exact "/" never matches an item — the root redirects.
 */
export function navItemFor(pathname: string): NavItem | undefined {
  let best: NavItem | undefined
  for (const item of NAV_ITEMS) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`)
    if (matches && (best === undefined || item.href.length > best.href.length)) best = item
  }
  return best
}

/**
 * The browser-tab title for a screen, from the same entry the page header and
 * the sidebar read. A page that typed its own `metadata.title` would be a
 * second home for the screen's name, free to drift from its <h1>.
 *
 * `undefined` for a route outside the registry, which Next resolves to the root
 * layout's default title rather than inventing one.
 */
export function navTitleFor(pathname: string): string | undefined {
  return navItemFor(pathname)?.label
}
