import type { Metadata } from "next"
import { preloadQuery } from "convex/nextjs"

import { apiKeyFunctions, type PreloadedApiKeys } from "@/components/api-keys"
import { CopyField } from "@/components/copy-field"
import { NotBuiltYet } from "@/components/not-built-yet"
import { SectionCard } from "@/components/section-card"
import { navTitleFor } from "@/components/shell/nav-items"
import { convexOptions } from "@/lib/convex-server"
import { agentEnvSnippet, normalizeGatewayUrl } from "@/lib/gateway-config"
import { SetupConsole } from "./setup-console"

export const metadata: Metadata = { title: navTitleFor("/setup") }

/**
 * The key list is preloaded with the caller's own token so Convex authorizes
 * the read itself. A failure is swallowed on purpose: `features/api_keys` is
 * deployed independently of this page, and a screen that cannot list keys must
 * still be able to CREATE one — that is the whole point of it.
 */
async function preloadKeys(): Promise<PreloadedApiKeys | null> {
  return await preloadQuery(apiKeyFunctions.listMine, {}, await convexOptions()).catch(() => null)
}

export default async function SetupPage() {
  // Literal `process.env.NEXT_PUBLIC_*` member access: Next inlines it at build
  // time, and a computed lookup would resolve to undefined in the bundle.
  const gatewayUrl = normalizeGatewayUrl(process.env.NEXT_PUBLIC_GATEWAY_URL)
  if (gatewayUrl === null) {
    return (
      <NotBuiltYet
        title="Gateway address not configured"
        blockedOn="NEXT_PUBLIC_GATEWAY_URL is unset or invalid for this deployment. It must be an https origin (plain http is accepted only for loopback during local development). See apps/web/.env.example."
      />
    )
  }

  const preloadedKeys = await preloadKeys()

  return (
    <div className="space-y-5">
      <SetupConsole gatewayUrl={gatewayUrl} preloadedKeys={preloadedKeys} />

      <SectionCard
        title="Connect a local machine"
        description="The Connectors Agent dials out to the relay. Nothing listens for inbound traffic on your machine, and no port forwarding, static IP or firewall rule is required."
      >
        <CopyField label="Agent environment" value={agentEnvSnippet(gatewayUrl)} />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Start the agent, and it prints a pairing code plus a link back to this dashboard.
          Approving that code is what grants the machine the right to execute local actions — the
          device credential it receives stays on the machine and is never sent to an AI client.
        </p>
      </SectionCard>
    </div>
  )
}
