import { Skeleton } from "@/components/skeleton"

/**
 * Devices renders a panel heading plus a two-column grid of cards, not a table,
 * so it must not borrow `TableSkeleton` — the loading shape has to be the shape
 * the data lands in or the page jumps. Mirrors DevicesPanel: the heading pair,
 * then the same `sm:grid-cols-2` grid the cards fill.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading devices" className="space-y-4">
      <div aria-hidden className="space-y-1">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div aria-hidden className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  )
}
