import type { ReactNode } from "react"
import { ShieldCheck } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Single-purpose screens that exist outside the dashboard chrome: sign-in and
 * device pairing. Deliberately renders no navigation — there is nothing to
 * navigate to until the one decision on the page is made.
 */
export function FocusLayout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10 text-foreground">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-5" aria-hidden />
        <span>Connectors Gateway</span>
      </div>
      <div className={cn("w-full max-w-sm", className)}>{children}</div>
    </div>
  )
}
