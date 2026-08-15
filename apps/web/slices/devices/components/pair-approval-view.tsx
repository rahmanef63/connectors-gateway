"use client"

import { useId } from "react"
import { Skeleton } from "@/components/skeleton"
import { formatTimestamp } from "../lib/format"
import type { TimestampFormatOptions } from "../lib/format"
import { pairingGrants, pairingNotice, resolvePairingState } from "../lib/pairing"
import type { PairingNotice } from "../lib/pairing"
import type { DevicesLabels, PairingChallengeView } from "../types"

/** A terminal state: one card, a title, and what to do about it. */
function Notice({ notice }: { notice: PairingNotice }) {
  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold text-foreground">{notice.title}</h2>
      {notice.description.length > 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{notice.description}</p>
      ) : null}
    </section>
  )
}

/** Loading wears the shape of the card it becomes, never a spinner or prose. */
function LoadingCard({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="card space-y-3 p-6">
      <Skeleton className="h-5 w-56 max-w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}

function Fact({ term, children }: { term: string; children: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="truncate font-medium text-foreground">{children}</dd>
    </div>
  )
}

export type PairApprovalViewProps = {
  /** `undefined` while the query resolves, `null` when the code is unknown. */
  challenge: PairingChallengeView | null | undefined
  labels: DevicesLabels
  /** Evaluated against the challenge deadline; the server re-checks on approve. */
  now: number
  pending: boolean
  onApprove: () => void
  dateFormat?: TimestampFormatOptions
}

/**
 * Presentational half of the approval panel: no query, no mutation.
 *
 * This is the one screen in the slice where a click hands a machine standing
 * permission to act, so the grant list is not fine print — it sits above the
 * button, in the reading path, and it says both halves out loud: the machine may
 * run local actions, and the credential it gets never appears here and never
 * reaches an AI client (AGENTS.md invariant 4). Every word of it is a label, so
 * a consumer can translate it but cannot accidentally drop it.
 */
export function PairApprovalView({
  challenge,
  labels,
  now,
  pending,
  onApprove,
  dateFormat,
}: PairApprovalViewProps) {
  const state = resolvePairingState(challenge, now)
  const titleId = useId()

  if (challenge === undefined) return <LoadingCard label={labels.loading} />
  if (challenge === null) return <Notice notice={pairingNotice("missing", labels)} />
  if (state !== "pending") return <Notice notice={pairingNotice(state, labels)} />

  return (
    <section className="card p-6" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-base font-semibold text-foreground">
        {labels.pairing.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {labels.pairing.description}
      </p>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <Fact term={labels.pairing.deviceLabel}>{challenge.deviceName}</Fact>
        <Fact term={labels.pairing.platformLabel}>{labels.platform[challenge.platform]}</Fact>
        <Fact term={labels.pairing.expiresLabel}>
          {formatTimestamp(challenge.expiresAt, dateFormat)}
        </Fact>
      </dl>

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-sm font-medium text-foreground">{labels.pairing.grantsTitle}</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          {pairingGrants(labels).map((grant) => (
            <li key={grant}>{grant}</li>
          ))}
        </ul>
      </div>

      <p className="mt-5 rounded-lg border border-border bg-card-hover px-4 py-3 text-sm leading-relaxed text-foreground">
        {labels.pairing.credentialNotice}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={onApprove} disabled={pending}>
          {pending ? labels.pairing.approving : labels.pairing.approve}
        </button>
      </div>
    </section>
  )
}
