/**
 * shadcn/ui primitive — vendored. Do not hand-edit.
 * Regenerate with: bunx shadcn@latest add label
 *
 * TODO(rr): stock shadcn wraps @radix-ui/react-label. That package is not
 * declared in apps/web/package.json and NO NEW DEPENDENCIES is a hard rule, so
 * this renders the native element with the same class contract. Regenerating
 * via the CLI will add the dependency and swap the implementation.
 */
import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Label }
