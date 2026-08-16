"use client"

/**
 * The key half of connecting: whatever this particular service asks for.
 *
 * The inputs are NOT hard-coded. A connector's manifest declares its own
 * credential fields, because "what do I paste?" is a property of the service:
 * Composio wants one API key, a CareerPack key is an id and a secret, and a
 * self-hosted server wants an address too. A form fixed to any one of those is
 * wrong for the others, and the wrongness shows up as a user staring at a
 * field their service never mentioned.
 *
 * Nothing here holds the secret: the form posts straight to a Server Action.
 */
import { useId } from "react"
import type { CredentialField } from "@cg/core"

import { FormField, FormError } from "./form-field"
import { CONNECTIONS_COPY, type ConnectErrorCode } from "./labels"

const COPY = CONNECTIONS_COPY.connect

/** What the form falls back to for a connector that declares nothing. */
const DEFAULT_FIELDS: readonly CredentialField[] = [
  { name: "secret", label: COPY.tokenLabel, secret: true, required: true },
]

export type ConnectKeyFormProps = {
  connectorId: string
  /** True when the manifest cannot name the server, so an address is required. */
  needsEndpoint: boolean
  fields: readonly CredentialField[]
  action: (formData: FormData) => void
  pending: boolean
  error: ConnectErrorCode | null
}

export function ConnectKeyForm({
  connectorId,
  needsEndpoint,
  fields,
  action,
  pending,
  error,
}: ConnectKeyFormProps) {
  const base = fields.length > 0 ? fields : DEFAULT_FIELDS
  // A connector with no address in its manifest and no field declaring one
  // still has to be asked — otherwise the only way to connect it is a form
  // that cannot submit.
  const declaresEndpoint = base.some((f) => f.role === "endpoint")
  const rendered =
    needsEndpoint && !declaresEndpoint
      ? [
          ...base,
          {
            name: "endpoint",
            label: COPY.endpointLabel,
            hint: COPY.endpointHint,
            secret: false,
            required: true,
            role: "endpoint" as const,
          },
        ]
      : base

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
        {rendered.map((field) => (
          <CredentialInput key={field.name} field={field} pending={pending} />
        ))}
        <FormError code={error} />
        <button type="submit" className="btn-ghost" disabled={pending}>
          {pending ? COPY.tokenPending : COPY.tokenSubmit}
        </button>
      </form>
    </details>
  )
}

function CredentialInput({ field, pending }: { field: CredentialField; pending: boolean }) {
  const id = useId()
  const errorId = useId()
  // Secret unless the manifest says otherwise: defaulting the other way turns
  // one missing `"secret": true` into a password rendered in clear text.
  const secret = field.secret !== false
  const optional = field.required === false
  return (
    <FormField
      id={id}
      errorId={errorId}
      label={optional ? `${field.label} (optional)` : field.label}
      hint={field.hint ?? ""}
      error={null}
    >
      <input
        id={id}
        name={field.name}
        type={secret ? "password" : field.role === "endpoint" ? "url" : "text"}
        className="field font-mono text-xs"
        autoComplete="off"
        spellCheck={false}
        maxLength={4096}
        placeholder={field.placeholder}
        disabled={pending}
      />
    </FormField>
  )
}
