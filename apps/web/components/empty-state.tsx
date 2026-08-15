import type { ReactNode } from "react"

/**
 * First-run surface. The copy a caller passes says what to do next — never
 * "No data": an empty screen is part of the feature, not a gap in it. The
 * `action` slot is where the next step goes when there is one to offer.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action}
    </div>
  )
}
