import { EmptyState } from "@/components/empty-state"

export type AuditEmptyStateProps = {
  title: string
  description: string
}

/**
 * Shown for "nothing recorded yet" and for "nothing matches the filters".
 *
 * A named seam over the app's shared `EmptyState`: the copy stays the slice's
 * (labels prop), the surface is the design system's. The slice keeps the export
 * so a consumer can place the same empty surface itself.
 */
export function AuditEmptyState({ title, description }: AuditEmptyStateProps) {
  return <EmptyState title={title} description={description} />
}
