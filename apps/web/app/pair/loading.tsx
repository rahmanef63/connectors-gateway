import { Skeleton } from "@/components/skeleton"

/**
 * Mirrors the shape of pair-outcome.tsx — eyebrow, title, body, then the
 * machine block — so the decision card does not jump when the challenge lands.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading pairing request" className="card p-6 sm:p-7">
      <Skeleton className="h-3.5 w-32" />
      <Skeleton className="mt-3 h-6 w-56 max-w-full" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-1.5 h-4 w-3/4" />
      <div className="mt-6 rounded-xl border border-border bg-card-hover px-5 py-4">
        <Skeleton className="h-5 w-44 max-w-full" />
        <Skeleton className="mt-2 h-4 w-24" />
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <Skeleton className="mt-6 h-9 w-full" />
    </div>
  )
}
