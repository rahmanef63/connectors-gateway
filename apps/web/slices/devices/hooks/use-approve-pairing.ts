"use client"

import { useCallback, useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { devicesFunctions } from "../config/functions"
import { resolveErrorMessage } from "../lib/errors"
import type { DevicesLabels } from "../types"

export type UseApprovePairing = {
  approvePairing: (code: string) => Promise<boolean>
  pending: boolean
}

/**
 * Browser side of the pairing handshake: the signed-in user approves a code.
 * The device credential is minted for the agent's claim call and is never
 * returned to this page (AGENTS.md invariant 4).
 */
export function useApprovePairing(labels: DevicesLabels): UseApprovePairing {
  const approve = useMutation(devicesFunctions.approvePairing)
  const [pending, setPending] = useState(false)

  const approvePairing = useCallback(
    async (code: string): Promise<boolean> => {
      setPending(true)
      try {
        await approve({ code })
        toast.success(labels.pairing.success)
        return true
      } catch (error) {
        toast.error(resolveErrorMessage(error, labels.errors))
        return false
      } finally {
        setPending(false)
      }
    },
    [approve, labels],
  )

  return { approvePairing, pending }
}
