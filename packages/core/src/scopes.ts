/**
 * Scope vocabulary shared by manifests, OAuth consent, token issuance and the
 * dynamic catalog. A scope that exists in only one of those places is either
 * decorative or makes tools silently disappear.
 */

/** Read-only actions. */
export const SCOPE_READ = "mcp.read" as const
/** Anything that writes, including destructive actions. */
export const SCOPE_WRITE = "mcp.write" as const

export const MCP_SCOPES = Object.freeze([SCOPE_READ, SCOPE_WRITE] as const)
export type McpScope = (typeof MCP_SCOPES)[number]

const MCP_SCOPE_SET: ReadonlySet<string> = new Set(MCP_SCOPES)

/** What a hand-minted full-access key and an OAuth request with no scope get. */
export function grantedScopes(): string[] {
  return [...MCP_SCOPES]
}

/**
 * Validate an untrusted scope array and return it in one canonical order.
 * Duplicate tokens are harmless and are collapsed; unknown and empty sets fail.
 */
export function normalizeMcpScopes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const requested = new Set<McpScope>()
  for (const scope of value) {
    if (typeof scope !== "string" || !MCP_SCOPE_SET.has(scope)) return null
    requested.add(scope as McpScope)
  }
  return MCP_SCOPES.filter((scope) => requested.has(scope))
}

/**
 * Parse RFC 6749's space-delimited `scope` parameter. Omitting it keeps the
 * pre-scope behavior (full access), which is required for existing MCP clients;
 * sending it opts into least privilege.
 */
export function parseMcpScopeParameter(value: string | null | undefined): string[] | null {
  if (value === null || value === undefined) return grantedScopes()
  if (value.length === 0 || /[\t\r\n]/.test(value)) return null

  const tokens = value.split(" ")
  // Leading, trailing, or repeated spaces produce an empty token. Reject rather
  // than silently repairing a security-sensitive request.
  if (tokens.some((token) => token.length === 0)) return null
  return normalizeMcpScopes(tokens)
}
