import Link from "next/link"

import { Icon } from "@/components/shell/icons"
import { TONE_CLASSES } from "@/components/status-badge"
import { cn } from "@/lib/cn"
import { DEFAULT_LANDING } from "@/lib/safe-redirect"

/**
 * The dead end. Rendered instead of a redirect, because the only place to
 * redirect a rejected request TO is the unverified URI that made it suspect.
 *
 * Both reasons deliberately share one message. "Unknown client" and "that
 * redirect URI is not registered" are different facts, and telling them apart
 * on an unauthenticated-by-construction screen turns it into a probe for which
 * client ids exist.
 */
export function AuthorizeRefusal({ reason }: { reason: "malformed" | "rejected" }) {
  const tone = TONE_CLASSES.danger
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
      <h1 className="mt-3 text-xl font-semibold tracking-tight">This request was not accepted</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        The application that sent you here did not ask for access in a way this server can verify,
        so nothing was approved and no access was granted.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Start the connection again from the application itself. If it keeps failing, the
        application needs to be registered before it can request access.
      </p>
      {/* No link back to the caller: the URI it supplied is exactly what could
          not be verified. */}
      <div className="mt-6">
        <Link href={DEFAULT_LANDING} className="btn-primary w-full">
          Go to the dashboard
        </Link>
      </div>
      <p className="sr-only">{reason}</p>
    </div>
  )
}
