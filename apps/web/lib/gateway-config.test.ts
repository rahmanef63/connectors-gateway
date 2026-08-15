import { describe, expect, test } from "vitest"
import {
  agentEnvSnippet,
  API_KEY_PLACEHOLDER,
  mcpClientConfig,
  mcpEndpoint,
  normalizeGatewayUrl,
  verifyCommand,
} from "./gateway-config"

describe("normalizeGatewayUrl", () => {
  test("accepts https and drops a trailing slash", () => {
    expect(normalizeGatewayUrl("https://connect.example.com")).toBe("https://connect.example.com")
    expect(normalizeGatewayUrl("https://connect.example.com/")).toBe("https://connect.example.com")
    expect(normalizeGatewayUrl("  https://connect.example.com//  ")).toBe(
      "https://connect.example.com",
    )
  })

  test("keeps a base path", () => {
    expect(normalizeGatewayUrl("https://example.com/gateway/")).toBe("https://example.com/gateway")
  })

  test("allows plain http on loopback for local development", () => {
    expect(normalizeGatewayUrl("http://localhost:8787")).toBe("http://localhost:8787")
    expect(normalizeGatewayUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787")
  })

  // DENIED cases.
  test("refuses plain http to a public host", () => {
    expect(normalizeGatewayUrl("http://connect.example.com")).toBeNull()
  })

  test("refuses non-http schemes", () => {
    expect(normalizeGatewayUrl("ws://connect.example.com")).toBeNull()
    expect(normalizeGatewayUrl("javascript:alert(1)")).toBeNull()
    expect(normalizeGatewayUrl("file:///etc/passwd")).toBeNull()
  })

  test("refuses embedded credentials so they can never be rendered", () => {
    expect(normalizeGatewayUrl("https://user:secret@connect.example.com")).toBeNull()
  })

  test("refuses unset, empty and unparseable values", () => {
    expect(normalizeGatewayUrl(undefined)).toBeNull()
    expect(normalizeGatewayUrl(null)).toBeNull()
    expect(normalizeGatewayUrl("")).toBeNull()
    expect(normalizeGatewayUrl("   ")).toBeNull()
    expect(normalizeGatewayUrl("connect.example.com")).toBeNull()
  })
})

describe("snippets", () => {
  const base = "https://connect.example.com"

  test("mcp endpoint", () => {
    expect(mcpEndpoint(base)).toBe("https://connect.example.com/mcp")
  })

  test("client config is valid JSON pointing at the gateway", () => {
    const parsed = JSON.parse(mcpClientConfig(base)) as {
      mcpServers: Record<string, { url: string; headers: Record<string, string> }>
    }
    const entry = parsed.mcpServers["connectors-gateway"]
    expect(entry?.url).toBe("https://connect.example.com/mcp")
    expect(entry?.headers.Authorization).toBe(`Bearer ${API_KEY_PLACEHOLDER}`)
  })

  test("every snippet carries the placeholder and no real-looking secret", () => {
    const snippets = [mcpClientConfig(base), verifyCommand(base), agentEnvSnippet(base)]
    for (const snippet of snippets) {
      expect(snippet).not.toMatch(/sk-[A-Za-z0-9]/)
      expect(snippet).not.toMatch(/cgk_/)
    }
    expect(mcpClientConfig(base)).toContain(API_KEY_PLACEHOLDER)
    expect(verifyCommand(base)).toContain(API_KEY_PLACEHOLDER)
    expect(agentEnvSnippet(base)).not.toContain(API_KEY_PLACEHOLDER)
  })

  test("agent env uses the outbound websocket relay path", () => {
    expect(agentEnvSnippet(base)).toBe("CG_GATEWAY_URL=wss://connect.example.com/device")
    expect(agentEnvSnippet("http://localhost:8787")).toBe("CG_GATEWAY_URL=ws://localhost:8787/device")
  })
})
