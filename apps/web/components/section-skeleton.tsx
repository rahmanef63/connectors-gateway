import { Skeleton } from "@/components/skeleton"

/**
 * Loading shape for a `SectionCard` — same surface, same padding, same rhythm,
 * so nothing moves when the real section lands.
 *
 * Decorative: the caller's `role="status"` wrapper carries the announcement.
 */
const range = (length: number) => Array.from({ length }, (_, index) => index)

export function SectionSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div aria-hidden className="card p-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-3.5 w-full max-w-lg" />
      <div className="mt-5 space-y-3">
        {range(lines).map((line) => (
          <Skeleton key={line} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
