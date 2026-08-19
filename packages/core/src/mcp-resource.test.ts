import { describe, expect, test } from "bun:test"
import { isMcpResource, normalizeMcpResourceUri } from "./mcp-resource"

describe("MCP OAuth resource indicators", () => {
  test("canonicalizes scheme, host, default port and dot segments", () => {
    expect(normalizeMcpResourceUri(" HTTPS://EXAMPLE.COM:443/a/../mcp ")).toBe(
      "https://example.com/mcp",
    )
  })

  test("uses the no-trailing-slash form for an origin resource", () => {
    expect(normalizeMcpResourceUri("https://example.com/")).toBe("https://example.com")
  })

  test("allows plain HTTP only on loopback", () => {
    expect(normalizeMcpResourceUri("http://127.0.0.1:8787/mcp")).toBe(
      "http://127.0.0.1:8787/mcp",
    )
    expect(normalizeMcpResourceUri("http://example.com/mcp")).toBeNull()
  })

  test.each([
    "connect.example.com/mcp",
    "javascript:alert(1)",
    "https://user:pass@example.com/mcp",
    "https://example.com/mcp?tenant=x",
    "https://example.com/mcp#fragment",
  ])("rejects non-canonical or unsafe resource %s", (value) => {
    expect(normalizeMcpResourceUri(value)).toBeNull()
  })

  test("compares canonical audience values exactly", () => {
    expect(isMcpResource("https://EXAMPLE.com:443/mcp", "https://example.com/mcp")).toBe(true)
    expect(isMcpResource("https://example.com/other", "https://example.com/mcp")).toBe(false)
  })
})
