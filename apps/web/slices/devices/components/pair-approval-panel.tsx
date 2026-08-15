"use client"

import { useMemo } from "react"
import { usePreloadedQuery, useQuery } from "convex/react"
import type { Preloaded } from "convex/react"
import { devicesFunctions } from "../config/functions"
import { DEFAULT_DEVICES_LABELS } from "../config/labels"
import type { TimestampFormatOptions } from "../lib/format"
import { mergeLabels } from "../lib/labels"
import type { LabelOverride } from "../lib/labels"
import { normalizePairingCode, toPairingChallengeView } from "../lib/pairing"
import { useApprovePairing } from "../hooks/use-approve-pairing"
import type { DevicesLabels, PairingChallengeView } from "../types"
import { PairApprovalView } from "./pair-approval-view"

export type PreloadedPairingChallenge = Preloaded<typeof devicesFunctions.pairingByCode>

export type PairApprovalPanelProps = {
  /** Pairing code from the agent, usually the `/pair` route parameter. */
  code: string
  /** First paint from a server component. Omit to query on the client. */
  preloaded?: PreloadedPairingChallenge
  /**
   * Server-rendered clock, so the first client render matches SSR exactly.
   * Advisory only — the approve mutation re-checks expiry server-side.
   */
  now?: number
  labels?: LabelOverride<DevicesLabels>
  dateFormat?: TimestampFormatOptions
  onApproved?: () => void
}

type ChallengeProps = {
  labels: DevicesLabels
  now: number
  dateFormat: TimestampFormatOptions | undefined
  pending: boolean
  onApprove: () => void
}

function PreloadedChallenge({
  preloaded,
  ...rest
}: ChallengeProps & { preloaded: PreloadedPairingChallenge }) {
  const record = usePreloadedQuery(preloaded)
  return <PairApprovalView challenge={toPairingChallengeView(record)} {...rest} />
}

function LiveChallenge({ code, ...rest }: ChallengeProps & { code: string | null }) {
  const record = useQuery(devicesFunctions.pairingByCode, code === null ? "skip" : { code })
  const challenge: PairingChallengeView | null | undefined =
    code === null ? null : record === undefined ? undefined : toPairingChallengeView(record)
  return <PairApprovalView challenge={challenge} {...rest} />
}

/** Browser half of device pairing (docs/04): show the requester, approve once. */
export function PairApprovalPanel({
  code,
  preloaded,
  now,
  labels,
  dateFormat,
  onApproved,
}: PairApprovalPanelProps) {
  const copy = useMemo(() => mergeLabels(DEFAULT_DEVICES_LABELS, labels), [labels])
  const normalized = useMemo(() => normalizePairingCode(code), [code])
  const { approvePairing, pending } = useApprovePairing(copy)

  async function onApprove() {
    if (normalized === null) return
    const approved = await approvePairing(normalized)
    if (approved) onApproved?.()
  }

  const shared: ChallengeProps = {
    labels: copy,
    now: now ?? Date.now(),
    dateFormat,
    pending,
    onApprove,
  }

  if (preloaded !== undefined) return <PreloadedChallenge preloaded={preloaded} {...shared} />
  return <LiveChallenge code={normalized} {...shared} />
}
