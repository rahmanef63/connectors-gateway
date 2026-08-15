import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { PairApproval } from "./pair-approval"
import { PairOutcome } from "./pair-outcome"
import { api } from "@convex/_generated/api"
import { convexOptions } from "@/lib/convex-server"
import { parsePairingCode } from "@/lib/pairing-code"

export const metadata: Metadata = { title: "Approve device" }

/**
 * Device pairing (docs/04). The visitor must already be signed in — proxy.ts
 * bounces anonymous requests to /sign-in?next=/pair?code=… so the code survives
 * the round trip.
 */
export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  // `?code=` is untrusted input: parse it before it can reach Convex.
  const code = parsePairingCode(params.code)
  const now = Date.now()

  if (code === null) {
    return <PairOutcome state="missing_code" code={null} challenge={null} now={now} />
  }

  const preloaded = await preloadQuery(
    api.features.pairing.queries.getByCode,
    { code },
    await convexOptions(),
  )

  return <PairApproval code={code} now={now} preloaded={preloaded} />
}
