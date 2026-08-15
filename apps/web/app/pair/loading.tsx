import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading pairing request</span>
      <Skeleton className="h-72 w-full" aria-hidden />
    </div>
  )
}
