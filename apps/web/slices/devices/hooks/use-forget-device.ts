"use client"

import { useCallback, useState } from "react"
import { useMutation } from "convex/react"
import { useToast } from "@/components/toast"
import { devicesFunctions } from "../config/functions"
import { resolveErrorMessage } from "../lib/errors"
import type { DevicesLabels } from "../types"

export type UseForgetDevice = {
  forgetDevice: (deviceId: string) => Promise<boolean>
  pending: boolean
}

/** Permanent removal is available only after server-enforced revocation. */
export function useForgetDevice(labels: DevicesLabels): UseForgetDevice {
  const forget = useMutation(devicesFunctions.forget)
  const { toast } = useToast()
  const [pending, setPending] = useState(false)

  const forgetDevice = useCallback(
    async (deviceId: string): Promise<boolean> => {
      setPending(true)
      try {
        await forget({ deviceId })
        toast(labels.forget.success, { tone: "success" })
        return true
      } catch (error) {
        toast(resolveErrorMessage(error, labels.errors), { tone: "danger" })
        return false
      } finally {
        setPending(false)
      }
    },
    [forget, labels, toast],
  )

  return { forgetDevice, pending }
}
