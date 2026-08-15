"use client"

// The account row. Pinned to the bottom of the sidebar, and repeated at the
// bottom of the mobile sheet — the sidebar is hidden below md, so the sheet is
// a phone's only route to sign out.
//
// The template's version is a dropdown over `api.users.me`. Neither exists
// here: this app ships no Dropdown primitive, and the pinned Convex contract
// has no viewer query, so the row is an identity line plus one real action.
//
// TODO(rr): `email` is undefined today for exactly that reason — the shell
// cannot name the signed-in user without inventing a backend function. When
// `features/auth/queries:viewer` lands, preload it in app/(app)/layout.tsx and
// thread it through AppShell; this component already renders it.
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthActions } from "@convex-dev/auth/react"

import { useToast } from "@/components/toast"
import { SITE_NAME } from "@/lib/site"
import { Icon } from "./icons"

export function NavUser({ email }: { email?: string }) {
  const { signOut } = useAuthActions()
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  async function onSignOut() {
    // `aria-disabled` keeps the button focusable while in flight (a real
    // `disabled` would dump focus to the body), so the guard is here.
    if (busy) return
    setBusy(true)
    try {
      await signOut()
      router.push("/sign-in")
      // The RSC cache still holds the authed render of whatever screen we were
      // on; without this it can paint again after the push.
      router.refresh()
    } catch {
      // Never surface the underlying error: it can carry token material.
      toast("Could not sign out. Try again.", { tone: "danger" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
        <Icon name="user" className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{email ?? "Signed in"}</span>
        <span className="block truncate text-xs text-muted-foreground">{SITE_NAME}</span>
      </span>
      <button
        type="button"
        onClick={onSignOut}
        aria-disabled={busy}
        aria-label="Sign out"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
      >
        <Icon name="logout" className="h-4 w-4" />
      </button>
    </div>
  )
}
