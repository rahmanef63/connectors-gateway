"use client"

import { CopyField } from "@/components/copy-field"
import { TONE_CLASSES } from "@/components/status-badge"
import { cn } from "@/lib/cn"
import { CONNECTIONS_COPY, SEAL_COMMAND } from "./labels"

/**
 * Sits directly above the token field, because this is the one thing on the
 * screen a user can get wrong in a way that fails silently.
 *
 * The gateway holds CREDENTIAL_ENCRYPTION_KEY and nothing else does, so sealing
 * cannot happen in this browser or in Convex. That is not a limitation to hide
 * — it is the reason the database can never read anyone's upstream token.
 */
export function SealInstructions() {
  return (
    <div className={cn("rounded-lg border p-4", TONE_CLASSES.warning.border)}>
      <p className="text-sm font-semibold text-foreground">{CONNECTIONS_COPY.seal.title}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {CONNECTIONS_COPY.seal.body}
      </p>
      <div className="mt-3">
        <CopyField label={CONNECTIONS_COPY.seal.commandLabel} value={SEAL_COMMAND} />
      </div>
      <p className={cn("mt-3 text-sm leading-relaxed", TONE_CLASSES.warning.text)}>
        {CONNECTIONS_COPY.seal.warning}
      </p>
    </div>
  )
}
