import { describe, expect, test } from "bun:test"
import {
  MCP_SCOPES,
  normalizeMcpScopes,
  parseMcpScopeParameter,
  SCOPE_READ,
  SCOPE_WRITE,
} from "./scopes"

describe("MCP OAuth scopes", () => {
  test("an omitted scope preserves the legacy full-access flow", () => {
    expect(parseMcpScopeParameter(undefined)).toEqual([...MCP_SCOPES])
    expect(parseMcpScopeParameter(null)).toEqual([...MCP_SCOPES])
  })

  test("a client can request read-only access", () => {
    expect(parseMcpScopeParameter(SCOPE_READ)).toEqual([SCOPE_READ])
  })

  test("normalization deduplicates and uses canonical order", () => {
    expect(normalizeMcpScopes([SCOPE_WRITE, SCOPE_READ, SCOPE_WRITE])).toEqual([
      SCOPE_READ,
      SCOPE_WRITE,
    ])
  })

  test.each(["", "mcp.unknown", "mcp.read  mcp.write", "mcp.read\tmcp.write"])(
    "rejects malformed or unsupported scope %j",
    (value) => expect(parseMcpScopeParameter(value)).toBeNull(),
  )

  test("an empty array never means unrestricted access", () => {
    expect(normalizeMcpScopes([])).toBeNull()
  })
})
