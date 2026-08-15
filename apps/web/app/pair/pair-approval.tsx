"use client"

import { useState } from "react"
import { useMutation, usePreloadedQuery, type Preloaded } from "convex/react"

import { PairOutcome } from "./pair-outcome"
import { api } from "@convex/_generated/api"
import { useToast } from "@/components/toast"
import { canApprove, pairingViewState, toChallengeView } from "@/lib/pairing-state"

/**
 * `now` is passed down from the server so the first client render matches SSR
 * exactly. The clock is advisory anyway: the approve mutation re-checks expiry,
 * single-use and ownership server-side, and it is the only authority.
 */
export function PairApproval({
  code,
  now,
  preloaded,
}: {
  code: string
  now: number
  preloaded: Preloaded<typeof api.features.pairing.queries.getByCode>
}) {
  const raw = usePreloadedQuery(preloaded)
  const approve = useMutation(api.features.pairing.mutations.approve)
  const [pending, setPending] = useState(false)
  const { toast } = useToast()

  const challenge = toChallengeView(raw)
  const state = pairingViewState({ code, challenge, now })

  async function onApprove() {
    // The button keeps its place in the tab order while in flight
    // (aria-disabled, not disabled), so the double-submit guard lives here.
    if (pending) return
    setPending(true)
    try {
      await approve({ code })
      toast("Machine approved. It can collect its credential now.", { tone: "success" })
    } catch {
      // The mutation's own message may name internal state; keep it out of the
      // UI. The screen itself re-renders into its real state from the live
      // query, so this line only has to explain, never to inform.
      toast("That code could not be approved. It may have expired or already been used.", {
        tone: "danger",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <PairOutcome
      state={state}
      code={code}
      challenge={challenge}
      now={now}
      action={
        canApprove(state) ? (
          <button
            type="button"
            onClick={onApprove}
            aria-disabled={pending}
            className="btn-primary w-full aria-disabled:opacity-50"
          >
            {pending ? "Approving…" : "Approve this machine"}
          </button>
        ) : undefined
      }
    />
  )
}
