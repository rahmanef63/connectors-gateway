"use client"

import { useCallback, useState } from "react"
import { useMutation } from "convex/react"

import { resolveErrorMessage } from "@/components/convex-error"
import { useToast } from "@/components/toast"
import { apiKeyFunctions } from "./functions"
import { API_KEYS_COPY, API_KEYS_ERROR_COPY } from "./labels"
import { readIssuedKey, type IssuedKey } from "./read"

/** Mirrors `convex/_shared/limits.ts` MIN/MAX_DISPLAY_NAME_LENGTH. */
const MIN_LABEL = 1
const MAX_LABEL = 64

export type UseIssueApiKey = {
  /** Resolves to the one and only copy of the key, or null on any failure. */
  issueKey: (label: string) => Promise<IssuedKey | null>
  pending: boolean
}

/**
 * Mints a key. The resolved value is handed straight to React state by the
 * caller and never leaves the page view: nothing here writes to storage, logs
 * the token, or keeps a reference after the promise settles.
 */
export function useIssueApiKey(): UseIssueApiKey {
  const issue = useMutation(apiKeyFunctions.issue)
  const { toast } = useToast()
  const [pending, setPending] = useState(false)

  const issueKey = useCallback(
    async (label: string): Promise<IssuedKey | null> => {
      const trimmed = label.trim()
      if (trimmed.length < MIN_LABEL || trimmed.length > MAX_LABEL) {
        toast(API_KEYS_COPY.create.invalid, { tone: "danger" })
        return null
      }
      setPending(true)
      try {
        const issued = readIssuedKey(await issue({ label: trimmed }))
        if (issued === null) {
          toast(API_KEYS_COPY.create.unreadable, { tone: "danger" })
          return null
        }
        toast(API_KEYS_COPY.create.success, { tone: "success" })
        return issued
      } catch (error) {
        toast(resolveErrorMessage(error, API_KEYS_ERROR_COPY), { tone: "danger" })
        return null
      } finally {
        setPending(false)
      }
    },
    [issue, toast],
  )

  return { issueKey, pending }
}

export type UseRevokeApiKey = {
  revokeKey: (keyId: string) => Promise<boolean>
  pending: boolean
}

/** Revocation is terminal: the gateway rejects the key on its next call. */
export function useRevokeApiKey(): UseRevokeApiKey {
  const revoke = useMutation(apiKeyFunctions.revoke)
  const { toast } = useToast()
  const [pending, setPending] = useState(false)

  const revokeKey = useCallback(
    async (keyId: string): Promise<boolean> => {
      setPending(true)
      try {
        await revoke({ keyId })
        toast(API_KEYS_COPY.revoke.success, { tone: "success" })
        return true
      } catch (error) {
        toast(resolveErrorMessage(error, API_KEYS_ERROR_COPY), { tone: "danger" })
        return false
      } finally {
        setPending(false)
      }
    },
    [revoke, toast],
  )

  return { revokeKey, pending }
}
