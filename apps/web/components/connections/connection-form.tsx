"use client"

import { useId, useState } from "react"
import type { FormEvent } from "react"
import { AUTH_TYPES, type AuthType } from "@cg/core"

import { FormField } from "./form-field"
import { AUTH_TYPE_LABELS, CONNECTIONS_COPY, DEFAULT_AUTH_TYPE, FIELD_ISSUE_COPY } from "./labels"
import { SealInstructions } from "./seal-instructions"
import { DEPLOYMENT_HOSTS } from "./self-hosts"
import { useUpsertConnection, type SaveFailure } from "./use-connections"
import type { ConnectionFormInput } from "./validate"

type FormState = ConnectionFormInput & { authType: AuthType }

const EMPTY: FormState = {
  connectorId: "",
  baseUrl: "",
  tokenCipher: "",
  authType: DEFAULT_AUTH_TYPE,
}

/**
 * Connector stays free text with a `<datalist>` of suggestions rather than a
 * closed select: the gateway's own catalog is per-caller and needs an API key,
 * so this page cannot ask it what exists. The suggestions now come from the
 * manifests this build ships (`lib/catalog.ts` — the same files the gateway
 * boots from), which is why a card's Connect button can prefill it, but a hand-
 * typed id must still be allowed or a connector added on the gateway host would
 * be unreachable from here until the dashboard is rebuilt.
 *
 * `initialConnectorId` is applied at mount only. The catalog remounts this form
 * with a new `key` when another card is picked, which resets the whole form —
 * deliberate, since a half-filled credential for connector A must not survive
 * into connector B.
 */
export function ConnectionForm({
  knownConnectorIds,
  initialConnectorId = "",
}: {
  knownConnectorIds: readonly string[]
  initialConnectorId?: string
}) {
  const [values, setValues] = useState<FormState>({ ...EMPTY, connectorId: initialConnectorId })
  const [failure, setFailure] = useState<SaveFailure | null>(null)
  const { saveConnection, pending } = useUpsertConnection({ selfHosts: DEPLOYMENT_HOSTS })
  const listId = useId()
  const ids = { connectorId: useId(), baseUrl: useId(), authType: useId(), tokenCipher: useId() }
  const errorIds = { connectorId: useId(), baseUrl: useId(), authType: useId(), tokenCipher: useId() }

  const issueFor = (field: keyof ConnectionFormInput): string | null =>
    failure?.field === field && failure.issue !== undefined ? FIELD_ISSUE_COPY[failure.issue] : null

  function set(field: keyof ConnectionFormInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (failure?.field === field) setFailure(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await saveConnection(values)
    setFailure(result)
    // Cleared on success only: a failed save leaves the sealed value in place,
    // so it does not have to be produced on the server a second time.
    if (result === null) setValues(EMPTY)
  }

  const options = [...new Set(knownConnectorIds)].sort()

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <FormField
          id={ids.connectorId}
          errorId={errorIds.connectorId}
          label={CONNECTIONS_COPY.connector.label}
          hint={
            options.length === 0
              ? CONNECTIONS_COPY.connector.hint
              : CONNECTIONS_COPY.connector.listHint
          }
          error={issueFor("connectorId")}
        >
          <input
            id={ids.connectorId}
            name="connectorId"
            className="field"
            list={options.length === 0 ? undefined : listId}
            value={values.connectorId}
            onChange={(event) => set("connectorId", event.target.value)}
            placeholder={CONNECTIONS_COPY.connector.placeholder}
            aria-describedby={errorIds.connectorId}
            aria-invalid={issueFor("connectorId") !== null}
            autoComplete="off"
            spellCheck={false}
            maxLength={128}
            disabled={pending}
          />
          {options.length === 0 ? null : (
            <datalist id={listId}>
              {options.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          )}
        </FormField>

        <FormField
          id={ids.baseUrl}
          errorId={errorIds.baseUrl}
          label={CONNECTIONS_COPY.baseUrl.label}
          hint={CONNECTIONS_COPY.baseUrl.hint}
          error={issueFor("baseUrl")}
        >
          <input
            id={ids.baseUrl}
            name="baseUrl"
            type="url"
            className="field"
            value={values.baseUrl}
            onChange={(event) => set("baseUrl", event.target.value)}
            placeholder={CONNECTIONS_COPY.baseUrl.placeholder}
            aria-describedby={errorIds.baseUrl}
            aria-invalid={issueFor("baseUrl") !== null}
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
          />
        </FormField>
      </div>

      <div className="max-w-xs">
        <FormField
          id={ids.authType}
          errorId={errorIds.authType}
          label={CONNECTIONS_COPY.authType.label}
          hint={CONNECTIONS_COPY.authType.hint}
          error={null}
        >
          {/* Iterated from the protocol's own vocabulary, never a hand-written list. */}
          <select
            id={ids.authType}
            name="authType"
            className="field"
            value={values.authType}
            onChange={(event) =>
              setValues((current) => ({ ...current, authType: event.target.value as AuthType }))
            }
            disabled={pending}
          >
            {AUTH_TYPES.map((type) => (
              <option key={type} value={type}>
                {AUTH_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <SealInstructions />

      <FormField
        id={ids.tokenCipher}
        errorId={errorIds.tokenCipher}
        label={CONNECTIONS_COPY.token.label}
        hint={CONNECTIONS_COPY.token.hint}
        error={issueFor("tokenCipher")}
      >
        <textarea
          id={ids.tokenCipher}
          name="tokenCipher"
          rows={3}
          className="field font-mono text-xs"
          value={values.tokenCipher}
          onChange={(event) => set("tokenCipher", event.target.value)}
          placeholder={CONNECTIONS_COPY.token.placeholder}
          aria-describedby={errorIds.tokenCipher}
          aria-invalid={issueFor("tokenCipher") !== null}
          autoComplete="off"
          spellCheck={false}
          disabled={pending}
        />
      </FormField>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? CONNECTIONS_COPY.pending : CONNECTIONS_COPY.submit}
      </button>
    </form>
  )
}
