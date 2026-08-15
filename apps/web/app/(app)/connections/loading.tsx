import { SectionSkeleton } from "@/components/section-skeleton"
import { TableSkeleton } from "@/components/table-skeleton"

/**
 * The add-a-connection card sits above the table on the real screen, so it sits
 * above the table here too — otherwise the list jumps down when the data lands.
 */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div role="status" aria-label="Loading">
        <SectionSkeleton lines={4} />
      </div>
      <TableSkeleton cols={5} />
    </div>
  )
}
