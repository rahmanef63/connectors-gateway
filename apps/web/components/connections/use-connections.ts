"use client"

import { useCallback, useState } from "react"
import { useMutation } from "convex/react"

import { resolveErrorMessage } from "@/components/convex-error"
import { useToast } from "@/components/toast"
import { connectionFunctions } from "./functions"
import { CONNECTIONS_COPY, CONNECTIONS_ERROR_COPY } from "./labels"

export type UseRemoveConnection = {
  /** Keyed by connector: the control plane deletes every row for that pair. */
  removeConnection: (connectorId: string) => Promise<boolean>
  pending: boolean
}

export function useRemoveConnection(): UseRemoveConnection {
  const remove = useMutation(connectionFunctions.remove)
  const { toast } = useToast()
  const [pending, setPending] = useState(false)

  const removeConnection = useCallback(
    async (connectorId: string): Promise<boolean> => {
      setPending(true)
      try {
        await remove({ connectorId })
        toast(CONNECTIONS_COPY.remove.success, { tone: "success" })
        return true
      } catch (error) {
        toast(resolveErrorMessage(error, CONNECTIONS_ERROR_COPY), { tone: "danger" })
        return false
      } finally {
        setPending(false)
      }
    },
    [remove, toast],
  )

  return { removeConnection, pending }
}
