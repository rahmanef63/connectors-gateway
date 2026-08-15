"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useAuthActions } from "@convex-dev/auth/react"
import { LogOut } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function SignOutButton() {
  const { signOut } = useAuthActions()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    try {
      await signOut()
      startTransition(() => {
        router.replace("/sign-in")
        router.refresh()
      })
    } catch {
      // Never surface the underlying error: it can carry token material.
      toast.error("Could not sign out. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={busy || pending}>
      <LogOut aria-hidden />
      Sign out
    </Button>
  )
}
