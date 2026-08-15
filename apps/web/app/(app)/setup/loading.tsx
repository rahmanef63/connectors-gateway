import { SectionSkeleton } from "@/components/section-skeleton"

/**
 * The page suspends on the API-key preload. This draws the same four sections
 * the real screen draws, so the layout does not jump when the keys land.
 *
 * The header is not drawn here: AppShell renders it from the nav registry and a
 * route's `loading.tsx` never replaces it.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      <SectionSkeleton lines={3} />
      <SectionSkeleton lines={2} />
      <SectionSkeleton lines={1} />
      <SectionSkeleton lines={1} />
    </div>
  )
}
