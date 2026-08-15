import type { ReactNode } from "react"
import Link from "next/link"

import { pairCopy, PAIR_EYEBROW } from "./pair-copy"
import { Icon } from "@/components/shell/icons"
import { TONE_CLASSES } from "@/components/status-badge"
import { cn } from "@/lib/cn"
import { formatExpiry, formatPlatform } from "@/lib/format"
import { formatPairingCode } from "@/lib/pairing-code"
import type { PairingChallengeView, PairingViewState } from "@/lib/pairing-state"
import { DEFAULT_LANDING } from "@/lib/safe-redirect"

/**
 * The whole /pair screen, for every state. Presentational only — no hooks, so
 * the server renders it directly and the "no code in the link" case never ships
 * a client bundle at all.
 *
 * This is the one place a human grants a machine the right to execute local
 * actions, so the machine being named is the loudest thing on the page, the
 * consequences are spelled out before the button, and the button says what it
 * does rather than "Confirm".
 */
export function PairOutcome({
  state,
  code,
  challenge,
  now,
  action,
}: {
  state: PairingViewState
  code: string | null
  challenge: PairingChallengeView | null
  now: number
  action?: ReactNode
}) {
  const copy = pairCopy(state)
  const tone = TONE_CLASSES[copy.tone]
  const deciding = state === "ready"

  return (
    <div className={cn("card p-6 sm:p-7", tone.border)}>
      <p
        className={cn(
          "flex items-center gap-2 text-xs font-medium uppercase tracking-widest",
          tone.text,
        )}
      >
        <Icon name={copy.icon} className="size-4" />
        {PAIR_EYEBROW}
      </p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.body}</p>

      {challenge !== null ? (
        <div className="mt-6 rounded-xl border border-border bg-card-hover px-5 py-4">
          {/* The identity of the machine, given the weight the decision has. */}
          <p className="truncate text-lg font-semibold tracking-tight">{challenge.deviceName}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatPlatform(challenge.platform)}
          </p>
          <dl className="mt-4 grid grid-cols-[5.5rem_1fr] gap-y-2 border-t border-border pt-4 text-sm">
            <dt className="text-muted-foreground">Code</dt>
            <dd className="font-mono">{formatPairingCode(challenge.code)}</dd>
            <dt className="text-muted-foreground">Validity</dt>
            <dd className={cn(deciding ? tone.text : "text-muted-foreground")}>
              {formatExpiry(challenge.expiresAt, now)}
            </dd>
          </dl>
        </div>
      ) : null}

      {deciding ? (
        <div className="mt-6 border-t border-border pt-5">
          <h2 className="text-sm font-medium text-foreground">Approving this machine means:</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              it may execute local actions on itself — opening, editing and rendering files in the
              applications it detects;
            </li>
            <li>
              it receives a device credential that stays on that machine. It is never shown here,
              and never handed to ChatGPT, Claude or any other AI client;
            </li>
            <li>
              every action it runs is still checked against your permissions on every single call,
              and dangerous capabilities stay off unless you enable them;
            </li>
            <li>you can revoke it at any time from Devices, which ends its session immediately.</li>
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-2">
        {action}
        <Link
          href={DEFAULT_LANDING}
          className={cn("w-full", deciding ? "btn-ghost" : "btn-primary")}
        >
          {deciding ? "Cancel" : "Go to Devices"}
        </Link>
      </div>

      {/* A code that matched nothing is still worth echoing: it is how a visitor
          spots a truncated link without opening the agent again. */}
      {code !== null && challenge === null ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Code <span className="font-mono">{formatPairingCode(code)}</span>
        </p>
      ) : null}
    </div>
  )
}
