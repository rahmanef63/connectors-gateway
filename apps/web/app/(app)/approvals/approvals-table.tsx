"use client"

/**
 * The approval queue.
 *
 * Every row is one waiting call. The arguments are shown because "approve
 * gh.issue.delete" is not a decision anybody can make — which record is the
 * whole question. They are also model-written text rendered to a person about
 * to authorise something, so they are truncated server-side and displayed as
 * plain monospace, never parsed or interpreted here.
 */
import { useMutation, usePreloadedQuery, type Preloaded } from "convex/react"
import { useState } from "react"

import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { SectionCard } from "@/components/section-card"
import { StatusBadge } from "@/components/status-badge"

export function ApprovalsTable({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.features.approvals.queries.listPending>
}) {
  const pending = usePreloadedQuery(preloaded)
  const approve = useMutation(api.features.approvals.mutations.approve)
  const deny = useMutation(api.features.approvals.mutations.deny)
  const [busy, setBusy] = useState<string | null>(null)

  const answer = async (id: Id<"approvals">, allow: boolean) => {
    setBusy(id)
    try {
      await (allow ? approve({ approvalId: id }) : deny({ approvalId: id }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <SectionCard
      title="Pending approvals"
      description="Calls waiting on you. Each one is a single action with the arguments it will run with."
    >
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing is waiting. Actions classed R2 or higher appear here when an agent attempts one.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {pending.map((row) => (
            <li key={row.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-sm font-semibold">{row.actionId}</code>
                <StatusBadge tone="warning">{row.risk}</StatusBadge>
                <span className="text-xs text-muted-foreground">{row.connectorId}</span>
              </div>
              <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-xs">
                {row.inputPreview}
              </pre>
              <p className="text-xs text-muted-foreground">
                Expires {new Date(row.expiresAt).toLocaleTimeString()}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy === row.id}
                  onClick={() => void answer(row.id, true)}
                >
                  Approve once
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy === row.id}
                  onClick={() => void answer(row.id, false)}
                >
                  Deny
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
