import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { SignOutButton } from "./sign-out-button"
import { Badge } from "@/components/ui/badge"

/**
 * TODO(rr): `userLabel` is undefined today. The pinned Convex contract has no
 * viewer query, so the shell cannot name the signed-in user without inventing a
 * function the backend does not implement. When `features/auth/queries:viewer`
 * lands, preload it in app/(app)/layout.tsx and pass the email through here —
 * this component already renders it.
 */
export function AppHeader({ userLabel }: { userLabel?: string }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <Link href="/devices" className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5" aria-hidden />
          <span>Connectors Gateway</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="max-w-[14rem] truncate">
            {userLabel ?? "Signed in"}
          </Badge>
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}
