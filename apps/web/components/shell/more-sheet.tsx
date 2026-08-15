"use client"

// Mobile "all screens" bottom sheet (hidden on md+): a slide-up panel gridding
// every NAV_ITEMS entry by group, with the account row pinned under them — the
// sidebar (and its NavUser footer) is hidden below md, so this is a phone's only
// route to sign out.
//
// A native <dialog> opened with showModal(), so the platform supplies the top
// layer, the inert background, Escape-to-close, the focus trap, focus RESTORE on
// close, and the ::backdrop scrim — none of that is hand-rolled here. Only the
// scroll lock is ours (see below). Layout: a dialog centres itself, so mt-auto +
// w-full/max-w-none pin it to the bottom edge, and display comes from
// `max-md:open:flex` — plain `open:flex` outranks `md:hidden` and would leak
// onto desktop, while closed it falls through to the UA's display:none.
// `text-foreground` is not decoration: the UA gives dialogs `color: canvastext`,
// which ignores our theme.
import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Icon } from "./icons"
import { NAV_GROUPS, navItemFor, type NavItem } from "./nav-items"
import { NavUser } from "./nav-user"
import { cn } from "@/lib/cn"

export function MoreSheet({
  open,
  onClose,
  email,
}: {
  open: boolean
  onClose: () => void
  email?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  // Route-derived active state — see sidebar-nav.tsx.
  const activeSlug = navItemFor(usePathname())?.slug

  // The dialog is always mounted so the ref exists the moment `open` flips.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    // A modal dialog inerts the background but does NOT stop it scrolling — the
    // one piece of modal behaviour the platform still leaves to us.
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label="All screens"
      onClose={onClose}
      // A backdrop click lands on the dialog box itself; anything inside it doesn't.
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none flex-col rounded-t-2xl border-t border-border bg-card pb-[calc(env(safe-area-inset-bottom)+1rem)] text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-sm max-md:open:flex md:hidden"
    >
      <div className="mx-auto mt-3 h-1 w-9 shrink-0 rounded-full bg-border" />
      <div className="px-5 pt-3 pb-4">
        <h2 className="text-lg font-semibold tracking-tight">All screens</h2>
        <p className="text-sm text-muted-foreground">Everything this control plane has.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.group}>
            <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {group.label}
            </p>
            <div className="grid grid-cols-4 gap-x-2 gap-y-4">
              {group.items.map((item) => (
                <SheetItem
                  key={item.slug}
                  item={item}
                  active={item.slug === activeSlug}
                  onNavigate={onClose}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* Same component the sidebar footer uses, so signing out lives in one place. */}
      <div className="mt-3 shrink-0 border-t border-border px-4 pt-3">
        <NavUser email={email} />
      </div>
    </dialog>
  )
}

function SheetItem({
  item,
  active,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className="flex flex-col items-center gap-1.5"
    >
      <span
        className={cn(
          "grid h-14 w-14 place-items-center rounded-2xl border shadow-sm transition-transform motion-safe:active:scale-95",
          active
            ? "border-accent/50 bg-accent/12 text-accent"
            : "border-border bg-card-hover text-foreground",
        )}
      >
        <Icon name={item.icon} className="h-6 w-6" />
      </span>
      <span className="line-clamp-2 min-h-[2rem] text-center text-[11px] font-medium text-foreground/85">
        {item.label}
      </span>
    </Link>
  )
}
