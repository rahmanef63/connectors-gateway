/**
 * Copy-ready client configuration for the Setup screen (docs/12).
 *
 * INVARIANT: nothing here ever renders a real credential. The API key is always
 * a placeholder the user replaces locally — AGENTS.md invariant 12 and the P0
 * "never write a real secret into a file" rule.
 */

export const API_KEY_PLACEHOLDER = "PASTE_YOUR_GATEWAY_API_KEY_HERE"
export const MCP_PATH = "/mcp"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

/**
 * Validate NEXT_PUBLIC_GATEWAY_URL (an env var — a trust boundary) and return
 * its canonical origin form, or null. Plain http is only tolerated on loopback.
 */
export function normalizeGatewayUrl(raw: string | undefined | null): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) return null
  if (url.username !== "" || url.password !== "") return null

  const path = url.pathname.replace(/\/+$/, "")
  return `${url.origin}${path}`
}

export function mcpEndpoint(gatewayUrl: string): string {
  return `${gatewayUrl}${MCP_PATH}`
}

/** `mcpServers` entry for Claude Desktop / Cursor / any mcp-remote host. */
export function mcpClientConfig(gatewayUrl: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        "connectors-gateway": {
          type: "http",
          url: mcpEndpoint(gatewayUrl),
          headers: { Authorization: `Bearer ${API_KEY_PLACEHOLDER}` },
        },
      },
    },
    null,
    2,
  )
}

/** One-liner a user can paste into a terminal to prove the key works. */
export function verifyCommand(gatewayUrl: string): string {
  return [
    "curl -sS",
    `-H "Authorization: Bearer ${API_KEY_PLACEHOLDER}"`,
    `${gatewayUrl}/health`,
  ].join(" ")
}

/** Env block for the local agent (docs/04) — relay URL only, no secret. */
export function agentEnvSnippet(gatewayUrl: string): string {
  const relay = gatewayUrl.replace(/^http/, "ws")
  return `CG_GATEWAY_URL=${relay}/device`
}
