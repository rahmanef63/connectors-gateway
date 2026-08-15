import type { ReactNode } from "react"

import { Icon } from "@/components/shell/icons"
import { SITE_NAME } from "@/lib/site"
import { cn } from "@/lib/cn"

/**
 * Single-purpose screens that exist outside the dashboard chrome: sign-in and
 * device pairing. Deliberately renders no navigation — there is nothing to
 * navigate to until the one decision on the page is made.
 *
 * One centred column, sized by the caller (`className`) because pairing needs
 * more width than a sign-in form.
 */
export function FocusLayout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-12 text-foreground">
      <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Icon name="shield" className="size-5 text-accent" />
        {SITE_NAME}
      </p>
      <div className={cn("w-full max-w-sm", className)}>{children}</div>
    </div>
  )
}
