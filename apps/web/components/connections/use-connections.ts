"use client"

import { useCallback, useState } from "react"
import { useMutation } from "convex/react"
import type { AuthType } from "@cg/core"

import { resolveErrorMessage } from "@/components/convex-error"
import { useToast } from "@/components/toast"
import { connectionFunctions } from "./functions"
import { CONNECTIONS_COPY, CONNECTIONS_ERROR_COPY, FIELD_ISSUE_COPY } from "./labels"
import {
  validateConnectionForm,
  type BaseUrlOptions,
  type ConnectionFormInput,
  type FieldIssue,
} from "./validate"

export type SaveConnectionInput = ConnectionFormInput & { authType: AuthType }

export type SaveFailure = {
  /** Set when a field failed locally, so the form can point at it. */
  field?: keyof ConnectionFormInput
  issue?: FieldIssue
}

export type UseUpsertConnection = {
  /** Resolves `null` on success, or the field that stopped it. */
  saveConnection: (input: SaveConnectionInput) => Promise<SaveFailure | null>
  pending: boolean
}

/**
 * Writes the connection row. The sealed token travels once, as ciphertext, and
 * is not kept anywhere afterwards — the caller clears its field on success.
 *
 * Re-saving a connector the account already has is an UPDATE: the control plane
 * keeps one credential per (owner, connector), so this is how a rotated token
 * is installed, not a way to end up with two rows.
 */
export function useUpsertConnection(options: BaseUrlOptions = {}): UseUpsertConnection {
  const upsert = useMutation(connectionFunctions.upsert)
  const { toast } = useToast()
  const [pending, setPending] = useState(false)
  const selfHosts = options.selfHosts

  const saveConnection = useCallback(
    async (input: SaveConnectionInput): Promise<SaveFailure | null> => {
      const checked = validateConnectionForm(input, { selfHosts })
      if (!checked.ok) {
        toast(FIELD_ISSUE_COPY[checked.issue], { tone: "danger" })
        return { field: checked.field, issue: checked.issue }
      }
      setPending(true)
      try {
        await upsert({ ...checked.value, authType: input.authType })
        toast(CONNECTIONS_COPY.success, { tone: "success" })
        return null
      } catch (error) {
        // Server codes only — its message can name internal state (P1).
        toast(resolveErrorMessage(error, CONNECTIONS_ERROR_COPY), { tone: "danger" })
        return {}
      } finally {
        setPending(false)
      }
    },
    [upsert, toast, selfHosts],
  )

  return { saveConnection, pending }
}

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
