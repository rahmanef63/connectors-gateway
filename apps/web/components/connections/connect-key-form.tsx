"use client"

/**
 * The key half of connecting: paste a credential, and — for a service whose
 * address the manifest cannot know — paste that too.
 *
 * Its own file because the panel that composes it is capped at 200 lines by
 * `audit:file-size`, and because these two fields are the entire flow for a
 * connector with no OAuth to discover. Nothing here holds the secret: the form
 * posts straight to a Server Action.
 */
import { useId } from "react"

import { FormField, FormError } from "./form-field"
import { CONNECTIONS_COPY, type ConnectErrorCode } from "./labels"

const COPY = CONNECTIONS_COPY.connect

export type ConnectKeyFormProps = {
  connectorId: string
  needsEndpoint: boolean
  action: (formData: FormData) => void
  pending: boolean
  error: ConnectErrorCode | null
}

export function ConnectKeyForm({
  connectorId,
  needsEndpoint,
  action,
  pending,
  error,
}: ConnectKeyFormProps) {
  const ids = { secret: useId(), endpoint: useId() }
  const errorIds = { secret: useId(), endpoint: useId() }

  return (
    <details className="rounded-lg border border-border p-4" open={needsEndpoint}>
        <summary className="cursor-pointer text-sm font-medium">
        {needsEndpoint ? COPY.keyOnlyTitle : COPY.tokenTitle}
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {needsEndpoint ? COPY.keyOnlyHint : COPY.tokenHint}
        </p>
        <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="connectorId" value={connectorId} />
        {needsEndpoint && (
          <FormField
            id={ids.endpoint}
            errorId={errorIds.endpoint}
            label={COPY.endpointLabel}
            hint={COPY.endpointHint}
            error={null}
          >
            <input
              id={ids.endpoint}
              name="endpoint"
              type="url"
              inputMode="url"
              className="field font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
              maxLength={2048}
              placeholder="https://backend.composio.dev/v3/mcp/…?user_id=…"
              disabled={pending}
            />
          </FormField>
        )}
        <FormField
          id={ids.secret}
          errorId={errorIds.secret}
          label={COPY.tokenLabel}
          hint=""
          error={null}
        >
          <input
            id={ids.secret}
            name="secret"
            type="password"
            className="field font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
            maxLength={4096}
            disabled={pending}
          />
        </FormField>
        <FormError code={error} />
        <button type="submit" className="btn-ghost" disabled={pending}>
          {pending ? COPY.pending : COPY.tokenSubmit}
        </button>
        </form>
    </details>
  )
}
