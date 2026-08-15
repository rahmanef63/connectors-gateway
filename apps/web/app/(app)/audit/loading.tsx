import { Skeleton } from "@/components/skeleton"
import { TableSkeleton } from "@/components/table-skeleton"

/**
 * Audit renders a panel heading and a filter row above its table, so the bare
 * `TableSkeleton` alone would leave both to appear from nowhere. The table part
 * is still the shared one, so the rows themselves cannot drift.
 *
 * `TableSkeleton` carries the one `role="status"` announcement; the stand-ins
 * added here are decoration and stay `aria-hidden`, so nothing is said twice.
 */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div aria-hidden className="space-y-1">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div aria-hidden className="flex flex-wrap items-end gap-3">
        <Skeleton className="h-16 w-52" />
        <Skeleton className="h-16 w-40" />
      </div>
      <TableSkeleton />
    </div>
  )
}
