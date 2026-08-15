import type { Metadata } from "next"

import { PageHeader } from "@/components/app-shell/page-header"
import { navItemFor } from "@/components/app-shell/nav-items"
import { CopyField } from "@/components/copy-field"
import { NotBuiltYet } from "@/components/not-built-yet"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GATEWAY_URL } from "@/lib/env"
import {
  agentEnvSnippet,
  API_KEY_PLACEHOLDER,
  mcpClientConfig,
  mcpEndpoint,
  verifyCommand,
} from "@/lib/gateway-config"

export const metadata: Metadata = { title: "Setup" }

export default function SetupPage() {
  const description = navItemFor("/setup")?.description ?? ""

  if (GATEWAY_URL === null) {
    return (
      <>
        <PageHeader title="Setup" description={description} />
        <NotBuiltYet
          title="Gateway address not configured"
          blockedOn="NEXT_PUBLIC_GATEWAY_URL is unset or invalid for this deployment. It must be an https origin (plain http is accepted only for loopback during local development). See apps/web/.env.example."
        />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Setup" description={description} />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Connect an AI client</CardTitle>
            <CardDescription>
              One HTTPS endpoint serves every client. Paste this into the MCP server list of Claude
              Desktop, Cursor, or any host that speaks streamable HTTP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <CopyField label="Gateway endpoint" value={mcpEndpoint(GATEWAY_URL)} />
            <CopyField label="Client configuration" value={mcpClientConfig(GATEWAY_URL)} />
            <p className="text-sm text-muted-foreground">
              Replace <code className="font-mono">{API_KEY_PLACEHOLDER}</code> with an API key you
              issue for yourself. This page never displays a key: nothing here is secret, and a key
              shown in a dashboard is a key that ends up in a screenshot.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Check the key works</CardTitle>
            <CardDescription>Run this locally after pasting your own key in.</CardDescription>
          </CardHeader>
          <CardContent>
            <CopyField label="Verify" value={verifyCommand(GATEWAY_URL)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connect a local machine</CardTitle>
            <CardDescription>
              The Connectors Agent dials out to the relay. Nothing listens for inbound traffic on
              your machine, and no port forwarding, static IP or firewall rule is required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CopyField label="Agent environment" value={agentEnvSnippet(GATEWAY_URL)} />
            <p className="text-sm text-muted-foreground">
              Start the agent, and it prints a pairing code plus a link back to this dashboard.
              Approving that code is what grants the machine the right to execute local actions —
              the device credential it receives stays on the machine and is never sent to an AI
              client.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
