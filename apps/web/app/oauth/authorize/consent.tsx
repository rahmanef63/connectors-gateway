"use client"

import { useState } from "react"
import { useMutation } from "convex/react"
import { SCOPE_READ, SCOPE_WRITE } from "@cg/core"

import { api } from "@convex/_generated/api"
import { Icon } from "@/components/shell/icons"
import { TONE_CLASSES } from "@/components/status-badge"
import { cn } from "@/lib/cn"
import { buildRedirect } from "@/lib/oauth-authorize"

/**
 * The one place a human grants an AI client the right to act as them.
 *
 * Written on the same principle as /pair: name the application loudly, state
 * the consequences BEFORE the button, and label the button with what it does.
 * "Authorize" next to a client name the user cannot place is how a phishing
 * flow gets approved.
 */
export function AuthorizeConsent({
  clientName,
  redirectUri,
  clientId,
  codeChallenge,
  codeChallengeMethod,
  resource,
  issuer,
  scopes,
  state,
}: {
  clientName: string
  redirectUri: string
  clientId: string
  codeChallenge: string
  codeChallengeMethod: string
  resource: string
  issuer: string
  scopes: string[]
  state: string | null
}) {
  const approve = useMutation(api.features.oauth.mutations.approve)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const tone = TONE_CLASSES.warning
  const canRead = scopes.includes(SCOPE_READ)
  const canWrite = scopes.includes(SCOPE_WRITE)

  /**
   * `location.assign`, not `router.push`: the destination is frequently a
   * private-use scheme (`cursor://`, `vscode://`) or another origin entirely,
   * and the Next router handles neither.
   */
  function leave(url: string): void {
    window.location.assign(url)
  }

  async function onApprove(): Promise<void> {
    if (pending) return
    setPending(true)
    setFailed(false)
    try {
      const { code } = await approve({
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        resource,
        issuer,
        scopes,
      })
      leave(buildRedirect(redirectUri, { code }, state, issuer))
    } catch {
      // Stay put and say so. Redirecting with `error=server_error` would end
      // the flow on the client's side for what may be a transient failure the
      // user can simply retry.
      setFailed(true)
      setPending(false)
    }
  }

  function onDeny(): void {
    // A denial IS reported back, and to the same verified URI: a client left
    // waiting on a window that silently closed cannot tell refusal from a crash.
    leave(buildRedirect(redirectUri, { error: "access_denied" }, state, issuer))
  }

  return (
    <div className={cn("card p-6 sm:p-7", tone.border)}>
      <p
        className={cn(
          "flex items-center gap-2 text-xs font-medium uppercase tracking-widest",
          tone.text,
        )}
      >
        <Icon name="shield" className="size-4" />
        Authorization
      </p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">
        Connect {clientName} to your gateway?
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {clientName} is asking to act on your behalf through this gateway.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-card-hover px-5 py-4">
        <p className="truncate text-lg font-semibold tracking-tight">{clientName}</p>
        <dl className="mt-4 grid grid-cols-[5.5rem_1fr] gap-y-2 border-t border-border pt-4 text-sm">
          <dt className="text-muted-foreground">Access target</dt>
          <dd className="truncate font-mono text-xs" title={resource}>
            {resource}
          </dd>
          <dt className="text-muted-foreground">Returns to</dt>
          {/* The destination is shown because it is the part of an OAuth flow a
              phishing attempt has to get wrong, and the only part a human can
              actually check. */}
          <dd className="truncate font-mono text-xs" title={redirectUri}>
            {redirectUri}
          </dd>
        </dl>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h2 className="text-sm font-medium text-foreground">Approving means {clientName} can:</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          {canRead ? (
            <li>see your available connectors and use their read-only actions;</li>
          ) : null}
          {canWrite ? (
            <li>
              request actions that change connected accounts or devices; risky calls still stop
              for a separate per-call approval;
            </li>
          ) : null}
          <li>
            ask this gateway to use your stored credentials without receiving the credentials
            themselves;
          </li>
          <li>
            be cut off whenever you want — revoking its API-key entry ends access immediately.
          </li>
        </ul>
      </div>

      {failed ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          That could not be completed. Nothing was granted — try again.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onApprove}
          aria-disabled={pending}
          className="btn-primary w-full aria-disabled:opacity-50"
        >
          {pending ? "Connecting…" : `Connect ${clientName}`}
        </button>
        <button type="button" onClick={onDeny} className="btn-ghost w-full">
          Cancel
        </button>
      </div>
    </div>
  )
}
