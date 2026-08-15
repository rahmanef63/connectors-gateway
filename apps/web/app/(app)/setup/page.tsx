import type { Metadata } from "next"
import type { ReactNode } from "react"

import { CopyField } from "@/components/copy-field"
import { NotBuiltYet } from "@/components/not-built-yet"
import { GATEWAY_URL } from "@/lib/env"
import { navTitleFor } from "@/components/shell/nav-items"
import {
  agentEnvSnippet,
  API_KEY_PLACEHOLDER,
  mcpClientConfig,
  mcpEndpoint,
  verifyCommand,
} from "@/lib/gateway-config"

export const metadata: Metadata = { title: navTitleFor("/setup") }

/**
 * One section of the setup walk-through. Local to this page on purpose — it has
 * one caller, and the shell already owns the page-level header, so this is only
 * the `.card` + `<h2>` + lede shape repeated three times.
 */
function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  )
}

export default function SetupPage() {
  if (GATEWAY_URL === null) {
    return (
      <NotBuiltYet
        title="Gateway address not configured"
        blockedOn="NEXT_PUBLIC_GATEWAY_URL is unset or invalid for this deployment. It must be an https origin (plain http is accepted only for loopback during local development). See apps/web/.env.example."
      />
    )
  }

  return (
    <div className="space-y-5">
      <Section
        title="Connect an AI client"
        description="One HTTPS endpoint serves every client. Paste this into the MCP server list of Claude Desktop, Cursor, or any host that speaks streamable HTTP."
      >
        <CopyField label="Gateway endpoint" value={mcpEndpoint(GATEWAY_URL)} />
        <CopyField label="Client configuration" value={mcpClientConfig(GATEWAY_URL)} />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Replace <code className="font-mono text-foreground">{API_KEY_PLACEHOLDER}</code> with an
          API key you issue for yourself. This page never displays a key: nothing here is secret,
          and a key shown in a dashboard is a key that ends up in a screenshot.
        </p>
      </Section>

      <Section
        title="Check the key works"
        description="Run this locally after pasting your own key in."
      >
        <CopyField label="Verify" value={verifyCommand(GATEWAY_URL)} />
      </Section>

      <Section
        title="Connect a local machine"
        description="The Connectors Agent dials out to the relay. Nothing listens for inbound traffic on your machine, and no port forwarding, static IP or firewall rule is required."
      >
        <CopyField label="Agent environment" value={agentEnvSnippet(GATEWAY_URL)} />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Start the agent, and it prints a pairing code plus a link back to this dashboard.
          Approving that code is what grants the machine the right to execute local actions — the
          device credential it receives stays on the machine and is never sent to an AI client.
        </p>
      </Section>
    </div>
  )
}
