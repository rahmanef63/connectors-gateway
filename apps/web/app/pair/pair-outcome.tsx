import type { ReactNode } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react"

import { pairCopy } from "./pair-copy"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatExpiry, formatPlatform } from "@/lib/format"
import { formatPairingCode } from "@/lib/pairing-code"
import type { PairingChallengeView, PairingViewState } from "@/lib/pairing-state"

const TONE_ICONS = {
  neutral: Info,
  warning: AlertTriangle,
  danger: ShieldAlert,
  success: CheckCircle2,
} as const

/** Presentational only — no hooks, so the server can render it directly. */
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
  const Icon = TONE_ICONS[copy.tone]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon
            className={copy.tone === "danger" ? "size-4 text-destructive" : "size-4 text-muted-foreground"}
            aria-hidden
          />
          {copy.title}
        </CardTitle>
        <CardDescription>{copy.body}</CardDescription>
      </CardHeader>

      {challenge !== null ? (
        <CardContent className="space-y-3 text-sm">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
            <dt className="text-muted-foreground">Machine</dt>
            <dd className="min-w-0 truncate font-medium">{challenge.deviceName}</dd>
            <dt className="text-muted-foreground">Platform</dt>
            <dd>{formatPlatform(challenge.platform)}</dd>
            <dt className="text-muted-foreground">Code</dt>
            <dd className="font-mono">{formatPairingCode(challenge.code)}</dd>
            <dt className="text-muted-foreground">Validity</dt>
            <dd>{formatExpiry(challenge.expiresAt, now)}</dd>
          </dl>
        </CardContent>
      ) : null}

      {state === "ready" ? (
        <CardContent className="space-y-3">
          <Separator />
          <p className="text-sm font-medium">Approving this machine means:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              it may execute local actions on itself — opening, editing and rendering files in the
              applications it detects;
            </li>
            <li>
              it receives a device credential that stays on that machine. It is never shown here, and
              never handed to ChatGPT, Claude or any other AI client;
            </li>
            <li>
              every action it runs is still checked against your permissions on every single call,
              and dangerous capabilities stay off unless you enable them;
            </li>
            <li>you can revoke it at any time from Devices, which ends its session immediately.</li>
          </ul>
        </CardContent>
      ) : null}

      <CardFooter className="flex-col items-stretch gap-2">
        {action}
        <Button asChild variant={state === "ready" ? "ghost" : "outline"}>
          <Link href="/devices">{state === "ready" ? "Cancel" : "Go to Devices"}</Link>
        </Button>
        {code !== null && challenge === null ? (
          <p className="text-center text-xs text-muted-foreground">
            Code <span className="font-mono">{formatPairingCode(code)}</span>
          </p>
        ) : null}
      </CardFooter>
    </Card>
  )
}
