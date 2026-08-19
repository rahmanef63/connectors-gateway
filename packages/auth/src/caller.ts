/**
 * Caller authentication for the public gateway edge (docs/07-mcp-gateway.md).
 * Identity is derived ONLY from the presented credential — never from a field
 * in the request body or a tool argument.
 */
import { GatewayError, type Principal } from "@cg/core"
import { dummyStoredHash, verifySecret } from "./hash"
import { TOKEN_PREFIXES, parseToken } from "./tokens"

export type ApiKeyStatus = "active" | "revoked" | "expired"

export type ApiKeyRecord = {
  id: string
  userId: string
  workspaceId?: string
  scopes: string[]
  status: ApiKeyStatus
  /** Output of `hashSecret`. Never the raw secret. */
  secretHash: string
  /** epoch ms */
  expiresAt?: number
  /** RFC 8707 target resource. Absent for manual and pre-migration keys. */
  audience?: string
}

/** The port. Production implementation is the Convex control plane. */
export interface ApiKeyLookup {
  getApiKey(keyId: string): Promise<ApiKeyRecord | null>
}

/** Every failure mode returns this exact error — the caller learns nothing else. */
function notAuthenticated(): GatewayError {
  return new GatewayError("NOT_AUTHENTICATED", "Invalid credentials.")
}

/** `Authorization: Bearer <token>`; the scheme is case-insensitive per RFC 7235. */
export function parseAuthorizationHeader(header: string | null | undefined): string | null {
  if (typeof header !== "string") return null
  const match = /^bearer[ \t]+([^ \t]+)[ \t]*$/i.exec(header.trim())
  return match?.[1] ?? null
}

/** A store row is still external input (P0): validate before trusting it. */
function isApiKeyRecord(value: unknown): value is ApiKeyRecord {
  if (typeof value !== "object" || value === null) return false
  const record = value as Partial<ApiKeyRecord>
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    typeof record.userId === "string" &&
    record.userId.length > 0 &&
    typeof record.secretHash === "string" &&
    typeof record.status === "string" &&
    Array.isArray(record.scopes) &&
    record.scopes.every((scope) => typeof scope === "string") &&
    (record.workspaceId === undefined || typeof record.workspaceId === "string") &&
    (record.expiresAt === undefined || typeof record.expiresAt === "number") &&
    (record.audience === undefined ||
      (typeof record.audience === "string" && record.audience.length > 0))
  )
}

/**
 * parse -> lookup -> verify -> status check.
 * An unknown key is verified against a dummy hash so it costs the same as a
 * wrong secret; the branch on `record` happens only after that work is done.
 */
export async function authenticateCaller(
  token: string,
  lookup: ApiKeyLookup,
  now: number = Date.now(),
  expectedAudience?: string,
): Promise<Principal> {
  const parsed = parseToken(TOKEN_PREFIXES.apiKey, token)
  if (!parsed) throw notAuthenticated()

  let found: unknown = null
  try {
    found = await lookup.getApiKey(parsed.id)
  } catch {
    // A store failure is a denial, never a different error the caller can probe.
    found = null
  }
  const record = isApiKeyRecord(found) ? found : null
  const stored = record ? record.secretHash : await dummyStoredHash()
  const secretOk = await verifySecret(parsed.secret, stored)

  if (!record || !secretOk) throw notAuthenticated()
  if (record.status !== "active") throw notAuthenticated()
  if (typeof record.expiresAt === "number" && record.expiresAt <= now) throw notAuthenticated()
  // A bound OAuth token is invalid on REST routes and on every other MCP
  // resource. Manual API keys have no audience and retain their existing use.
  if (record.audience !== undefined && record.audience !== expectedAudience) {
    throw notAuthenticated()
  }

  const principal: Principal = {
    callerId: record.id,
    userId: record.userId,
    scopes: [...record.scopes],
  }
  if (record.workspaceId !== undefined) principal.workspaceId = record.workspaceId
  return principal
}
