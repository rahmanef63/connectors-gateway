"use client"

// The eyebrow / title / sub block every screen wears, DERIVED from the route.
// Pages pass nothing: the nav registry already carries the label and the
// one-line "what is this screen for", so a page that re-declared them could
// only ever drift from the sidebar and the sheet.
//
// Mounted once by AppShell. A page must not render a second one.
import { usePathname } from "next/navigation"

import { GROUP_LABEL, navItemFor } from "./nav-items"

export function PageHeader() {
  // Route-derived, never state — see sidebar-nav.tsx for why.
  const item = navItemFor(usePathname())
  // A route outside the registry (an unknown nested path) gets no header rather
  // than an invented title.
  if (!item) return null

  return (
    <header className="pb-5 sm:pb-6">
      <p className="text-xs font-medium uppercase tracking-widest text-accent">
        {GROUP_LABEL[item.group]}
      </p>
      <h1 className="mt-1.5 truncate text-[1.65rem] font-semibold tracking-[-0.025em] sm:text-3xl">{item.label}</h1>
      {/* The title truncates because a screen name is short and one line is the
          template's shape. The description must NOT: it is the sentence that
          says what the screen is for, and on a phone `truncate` was cutting it
          to "…this account has authorised the gate…". */}
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{item.sub}</p>
    </header>
  )
}
