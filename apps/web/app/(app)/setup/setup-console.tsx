"use client"

import { useState } from "react"

import {
  ApiKeyList,
  ApiKeyListUnavailable,
  API_KEYS_COPY,
  CreateApiKeyForm,
  IssuedKeyNotice,
  type IssuedKey,
  type PreloadedApiKeys,
} from "@/components/api-keys"
import { CopyField } from "@/components/copy-field"
import { NotBuiltYet } from "@/components/not-built-yet"
import { SectionCard } from "@/components/section-card"
import {
  API_KEY_PLACEHOLDER,
  mcpClientConfig,
  mcpEndpoint,
  verifyCommand,
} from "@/lib/gateway-config"

/**
 * The interactive half of Setup: mint a key, see it once, and have the
 * copy-ready configuration below carry it while it is on screen.
 *
 * The raw key lives in ONE piece of React state, in this component, for the
 * length of this page view. It is never written to localStorage, never put in
 * the URL, never sent anywhere but the clipboard the user asks for. Navigating
 * away unmounts this component and the key is gone — which is the truth the
 * reveal panel states in words.
 *
 * `preloadedKeys` is null when the list could not be preloaded (the control
 * plane's api_keys module is deployed separately from this screen). Creating a
 * key still works in that state, so the section says so instead of claiming the
 * account has none.
 */
export function SetupConsole({
  gatewayUrl,
  preloadedKeys,
}: {
  gatewayUrl: string
  preloadedKeys: PreloadedApiKeys | null
}) {
  const [issued, setIssued] = useState<IssuedKey | null>(null)

  return (
    <>
      <SectionCard
        title={API_KEYS_COPY.sectionTitle}
        description={API_KEYS_COPY.sectionDescription}
      >
        <CreateApiKeyForm onIssued={setIssued} />
        {issued === null ? null : (
          <IssuedKeyNotice issued={issued} onDismiss={() => setIssued(null)} />
        )}
        {preloadedKeys === null ? (
          <ApiKeyListUnavailable />
        ) : (
          <ApiKeyList preloaded={preloadedKeys} />
        )}
      </SectionCard>

      <SectionCard
        title="Connect an AI client"
        description="One HTTPS endpoint, but not every host can use a key. Paste this into Claude Code, Claude Desktop, Cursor, mcp-remote, or anything you configure with a file — hosts that let you set an Authorization header."
      >
        <CopyField label="Gateway endpoint" value={mcpEndpoint(gatewayUrl)} />
        <CopyField
          label="Client configuration"
          value={mcpClientConfig(gatewayUrl, issued?.token)}
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {issued === null ? (
            <>
              Replace <code className="font-mono text-foreground">{API_KEY_PLACEHOLDER}</code> with
              the key you copied when you created it. This page cannot show it again — keys are
              stored as a hash, so nothing here can read one back.
            </>
          ) : (
            <>
              This block carries the key you just created, ready to paste. Dismiss the key above
              and the placeholder returns.
            </>
          )}
        </p>
      </SectionCard>

      <SectionCard
        title="Check the key works"
        description="Run this locally to prove the gateway accepts the key."
      >
        <CopyField label="Verify" value={verifyCommand(gatewayUrl, issued?.token)} />
      </SectionCard>

      <NotBuiltYet
        title="ChatGPT and Claude.ai cannot use a key"
        blockedOn="Their connector forms have no field for one — a consumer AI host will only attach to an MCP server it can complete an OAuth flow against. That makes this gateway an OAuth provider, which is a different job from the OAuth client it needs for GitHub or Notion, and neither exists yet. Until then, use a host you configure with a file: Claude Code, Claude Desktop, Cursor, or mcp-remote."
      />
    </>
  )
}
