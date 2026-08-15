"use client"

import { useState } from "react"
import { useMutation, usePreloadedQuery, type Preloaded } from "convex/react"
import { toast } from "sonner"

import { PairOutcome } from "./pair-outcome"
import { api } from "@convex/_generated/api"
import { Button } from "@/components/ui/button"
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

  const challenge = toChallengeView(raw)
  const state = pairingViewState({ code, challenge, now })

  async function onApprove() {
    setPending(true)
    try {
      await approve({ code })
      toast.success("Machine approved. It can collect its credential now.")
    } catch {
      // The mutation's own message may name internal state; keep it out of the UI.
      toast.error("That code could not be approved. It may have expired or already been used.")
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
          <Button onClick={onApprove} disabled={pending}>
            {pending ? "Approving…" : "Approve this machine"}
          </Button>
        ) : undefined
      }
    />
  )
}
