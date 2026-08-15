export type AuditEmptyStateProps = {
  title: string
  description: string
}

/** Shown for "nothing recorded yet" and for "nothing matches the filters". */
export function AuditEmptyState({ title, description }: AuditEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
