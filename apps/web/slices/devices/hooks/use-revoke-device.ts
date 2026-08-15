"use client"

import { useCallback, useState } from "react"
import { useMutation } from "convex/react"
import { useToast } from "@/components/toast"
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
  const { toast } = useToast()
  const [pending, setPending] = useState(false)

  const revokeDevice = useCallback(
    async (deviceId: string): Promise<boolean> => {
      setPending(true)
      try {
        await revoke({ deviceId })
        toast(labels.revoke.success, { tone: "success" })
        return true
      } catch (error) {
        toast(resolveErrorMessage(error, labels.errors), { tone: "danger" })
        return false
      } finally {
        setPending(false)
      }
    },
    [revoke, labels, toast],
  )

  return { revokeDevice, pending }
}
