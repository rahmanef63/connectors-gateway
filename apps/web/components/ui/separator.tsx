/**
 * shadcn/ui primitive — vendored. Do not hand-edit.
 * Regenerate with: bunx shadcn@latest add separator
 *
 * TODO(rr): stock shadcn wraps @radix-ui/react-separator, which is not declared
 * in apps/web/package.json (NO NEW DEPENDENCIES). This keeps the same API and
 * the same ARIA semantics on a plain element.
 */
import * as React from "react"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical"
  decorative?: boolean
}) {
  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "bg-border shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
