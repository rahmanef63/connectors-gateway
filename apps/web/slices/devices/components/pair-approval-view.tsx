"use client"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatTimestamp } from "../lib/format"
import type { TimestampFormatOptions } from "../lib/format"
import { pairingNotice, resolvePairingState } from "../lib/pairing"
import type { PairingNotice } from "../lib/pairing"
import type { DevicesLabels, PairingChallengeView } from "../types"

function Notice({ notice }: { notice: PairingNotice }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{notice.title}</CardTitle>
        {notice.description.length > 0 ? <CardDescription>{notice.description}</CardDescription> : null}
      </CardHeader>
    </Card>
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

/** Presentational half of the approval panel: no query, no mutation. */
export function PairApprovalView({
  challenge,
  labels,
  now,
  pending,
  onApprove,
  dateFormat,
}: PairApprovalViewProps) {
  const state = resolvePairingState(challenge, now)

  if (challenge === undefined) return <Notice notice={pairingNotice("loading", labels)} />
  if (challenge === null) return <Notice notice={pairingNotice("missing", labels)} />
  if (state !== "pending") return <Notice notice={pairingNotice(state, labels)} />

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.pairing.title}</CardTitle>
        <CardDescription>{labels.pairing.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">{labels.pairing.deviceLabel}</dt>
            <dd className="font-medium">{challenge.deviceName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{labels.pairing.platformLabel}</dt>
            <dd className="font-medium">{labels.platform[challenge.platform]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{labels.pairing.expiresLabel}</dt>
            <dd className="font-medium">{formatTimestamp(challenge.expiresAt, dateFormat)}</dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter>
        <Button type="button" onClick={onApprove} disabled={pending}>
          {pending ? labels.pairing.approving : labels.pairing.approve}
        </Button>
      </CardFooter>
    </Card>
  )
}
