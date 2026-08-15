"use client"

import { useCallback, useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { devicesFunctions } from "../config/functions"
import { resolveErrorMessage } from "../lib/errors"
import type { DevicesLabels } from "../types"

export type UseRevokeDevice = {
  revokeDevice: (deviceId: string) => Promise<boolean>
  pending: boolean
}

/** Revoking closes the device's session and invalidates its credential (docs/04). */
export function useRevokeDevice(labels: DevicesLabels): UseRevokeDevice {
  const revoke = useMutation(devicesFunctions.revoke)
  const [pending, setPending] = useState(false)

  const revokeDevice = useCallback(
    async (deviceId: string): Promise<boolean> => {
      setPending(true)
      try {
        await revoke({ deviceId })
        toast.success(labels.revoke.success)
        return true
      } catch (error) {
        toast.error(resolveErrorMessage(error, labels.errors))
        return false
      } finally {
        setPending(false)
      }
    },
    [revoke, labels],
  )

  return { revokeDevice, pending }
}
