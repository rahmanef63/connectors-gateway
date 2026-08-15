"use client"

import { useCallback, useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
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
  const [pending, setPending] = useState(false)

  const renameDevice = useCallback(
    async (deviceId: string, displayName: string): Promise<boolean> => {
      const trimmed = displayName.trim()
      if (trimmed.length === 0) {
        toast.error(labels.rename.invalid)
        return false
      }
      setPending(true)
      try {
        await rename({ deviceId, displayName: trimmed })
        toast.success(labels.rename.success)
        return true
      } catch (error) {
        toast.error(resolveErrorMessage(error, labels.errors))
        return false
      } finally {
        setPending(false)
      }
    },
    [rename, labels],
  )

  return { renameDevice, pending }
}
