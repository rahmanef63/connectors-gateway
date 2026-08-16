"use client"

/**
 * Connecting a connector, in one button.
 *
 * The panel asks for as little as the connector allows. For a service that
 * registers clients on demand (RFC 7591) that is nothing: press Connect,
 * approve, done. For one that does not, it is the two values its developer
 * console gives you. Everything else — where the service lives, how the
 * credential is presented, how it is encrypted — is a property of the connector
 * or of this server, and neither is a question for the user.
 *
 * Both paths are Server Actions: the credential and the sealing key exist only
 * on the server, and this component never holds either.
 */
import { useActionState, useId } from "react"

import { CopyField } from "@/components/copy-field"
import { FormField } from "./form-field"
import { CONNECTIONS_COPY, CONNECT_ERRORS, type ConnectErrorCode } from "./labels"
import { TONE_CLASSES } from "@/components/status-badge"
import { cn } from "@/lib/cn"

const COPY = CONNECTIONS_COPY.connect

export type ConnectAction = (
  state: { error: ConnectErrorCode | null },
  formData: FormData,
) => Promise<{ error: ConnectErrorCode | null }>

export type ConnectPanelProps = {
  /** The card the user picked, or null before they pick one. */
  connectorId: string | null
  connectorName: string | null
  redirectUri: string
  /** Set by the OAuth callback on its way back to this page. */
  notice: { kind: "connected"; name: string } | { kind: "error"; code: ConnectErrorCode } | null
  startOAuth: ConnectAction
  saveToken: ConnectAction
}

const IDLE = { error: null as ConnectErrorCode | null }

export function ConnectPanel({
  connectorId,
  connectorName,
  redirectUri,
  notice,
  startOAuth,
  saveToken,
}: ConnectPanelProps) {
  const [oauthState, oauthAction, oauthPending] = useActionState(startOAuth, IDLE)
  const [tokenState, tokenAction, tokenPending] = useActionState(saveToken, IDLE)
  const ids = { clientId: useId(), clientSecret: useId(), secret: useId() }
  const errorIds = { clientId: useId(), clientSecret: useId(), secret: useId() }

  if (connectorId === null || connectorName === null) {
    return (
      <>
        <Notice notice={notice} />
        <p className="text-sm text-muted-foreground">{COPY.idle}</p>
      </>
    )
  }

  return (
    <div className="space-y-5">
      <Notice notice={notice} />

      <div>
        <p className="text-sm font-semibold">{COPY.heading(connectorName)}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{COPY.lead}</p>
      </div>

      <form action={oauthAction} className="space-y-4">
        <input type="hidden" name="connectorId" value={connectorId} />

        {/* The primary action comes FIRST. The disclosure below it is for the
            minority of services that will not register a client themselves, and
            when it sat above the button it read as a required step. */}
        <FormError code={oauthState.error} />

        <button type="submit" className="btn-primary" disabled={oauthPending}>
          {oauthPending ? COPY.pending : `${COPY.submit} ${connectorName}`}
        </button>

        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">{COPY.byoTitle}</summary>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{COPY.byoHint}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <FormField
              id={ids.clientId}
              errorId={errorIds.clientId}
              label={COPY.clientId}
              hint=""
              error={null}
            >
              <input
                id={ids.clientId}
                name="clientId"
                className="field"
                autoComplete="off"
                spellCheck={false}
                maxLength={512}
                disabled={oauthPending}
              />
            </FormField>
            <FormField
              id={ids.clientSecret}
              errorId={errorIds.clientSecret}
              label={COPY.clientSecret}
              hint={COPY.clientSecretHint}
              error={null}
            >
              <input
                id={ids.clientSecret}
                name="clientSecret"
                type="password"
                className="field"
                autoComplete="off"
                spellCheck={false}
                maxLength={2048}
                disabled={oauthPending}
              />
            </FormField>
          </div>
          <div className="mt-2">
            <CopyField label={COPY.redirectLabel} value={redirectUri} />
          </div>
        </details>
      </form>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">{COPY.tokenTitle}</summary>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{COPY.tokenHint}</p>
        <form action={tokenAction} className="mt-4 space-y-4">
          <input type="hidden" name="connectorId" value={connectorId} />
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
              disabled={tokenPending}
            />
          </FormField>
          <FormError code={tokenState.error} />
          <button type="submit" className="btn-ghost" disabled={tokenPending}>
            {tokenPending ? COPY.tokenPending : COPY.tokenSubmit}
          </button>
        </form>
      </details>
    </div>
  )
}

function FormError({ code }: { code: ConnectErrorCode | null }) {
  if (code === null) return null
  return (
    <p role="alert" className={cn("text-sm leading-relaxed", TONE_CLASSES.danger.text)}>
      {CONNECT_ERRORS[code]}
    </p>
  )
}

function Notice({ notice }: { notice: ConnectPanelProps["notice"] }) {
  if (notice === null) return null
  const success = notice.kind === "connected"
  return (
    <p
      role="status"
      className={cn(
        "rounded-lg border p-3 text-sm leading-relaxed",
        success ? TONE_CLASSES.success.border : TONE_CLASSES.danger.border,
        success ? TONE_CLASSES.success.text : TONE_CLASSES.danger.text,
      )}
    >
      {success ? COPY.connected(notice.name) : CONNECT_ERRORS[notice.code]}
    </p>
  )
}
