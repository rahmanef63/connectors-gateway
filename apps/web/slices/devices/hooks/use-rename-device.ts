"use client"

import { useCallback, useState } from "react"
import { useMutation } from "convex/react"
import { useToast } from "@/components/toast"
import { devicesFunctions } from "../config/functions"
import { resolveErrorMessage } from "../lib/errors"
import type { DevicesLabels } from "../types"

export type UseRenameDevice = {
  renameDevice: (deviceId: string, displayName: string) => Promise<boolean>
  pending: boolean
}

/** Renaming never changes device identity (docs/04). */
export function useRenameDevice(labels: DevicesLabels): UseRenameDevice {
  const rename = useMutation(devicesFunctions.rename)
  const { toast } = useToast()
  const [pending, setPending] = useState(false)

  const renameDevice = useCallback(
    async (deviceId: string, displayName: string): Promise<boolean> => {
      const trimmed = displayName.trim()
      if (trimmed.length === 0) {
        toast(labels.rename.invalid, { tone: "danger" })
        return false
      }
      setPending(true)
      try {
        await rename({ deviceId, displayName: trimmed })
        toast(labels.rename.success, { tone: "success" })
        return true
      } catch (error) {
        toast(resolveErrorMessage(error, labels.errors), { tone: "danger" })
        return false
      } finally {
        setPending(false)
      }
    },
    [rename, labels, toast],
  )

  return { renameDevice, pending }
}
