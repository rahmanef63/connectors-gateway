/**
 * shadcn/ui primitive — vendored. Do not hand-edit.
 * Regenerate with: bunx shadcn@latest add skeleton
 */
import * as React from "react"

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
