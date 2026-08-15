/**
 * The drift guard between whatever mints a key and whatever verifies one.
 *
 * `features/api_keys/mutations:issue` writes `secretHash` inside Convex. The
 * gateway process reads that same string back through
 * `service/apiKeys:getRecord` and hands it to `@cg/auth`'s `verifySecret`.
 * A disagreement about the format is not an exception anywhere — `verifySecret`
 * returns `false` for a malformed stored value exactly as it does for a wrong
 * secret, so every AI client would fail to authenticate with no useful error.
 *
 * These tests therefore assert three separate things, because passing only the
 * first two would still let the two implementations drift:
 *   1. a hash produced by the feature verifies with the package's `verifySecret`
 *   2. the stored string has the exact literal wire format `parseStored` accepts
 *   3. the whole front door works: raw key -> `authenticateCaller` -> Principal
 */
import { describe, expect, test } from "vitest"
import {
  PBKDF2_ITERATIONS,
  TOKEN_PREFIXES,
  authenticateCaller,
  parseAuthorizationHeader,
  parseToken,
  verifySecret,
  type ApiKeyLookup,
  type ApiKeyRecord,
} from "@cg/auth"
import { api } from "../../_generated/api"
import { asUser, createUser, setupConvex, SERVICE_TOKEN, type TestClient } from "../../test.helpers"

/**
 * The literal format `@cg/auth`'s `parseStored` accepts, spelled out here on
 * purpose: 16 salt bytes are 22 base64url characters, 32 key bytes are 43.
 * Widening this regex is the deliberate act of changing the credential format.
 */
const STORED_HASH = /^pbkdf2\$sha256\$210000\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/

async function storedHashOf(t: TestClient, keyId: string): Promise<string> {
  const record = await t.query(api.service.apiKeys.getRecord, {
    serviceToken: SERVICE_TOKEN,
    keyId,
  })
  if (record === null) throw new Error("The key was not stored.")
  return record.secretHash
}

/** The gateway's `ApiKeyLookup` port, backed by the real service query. */
function gatewayLookup(t: TestClient): ApiKeyLookup {
  return {
    async getApiKey(keyId: string): Promise<ApiKeyRecord | null> {
      const row = await t.query(api.service.apiKeys.getRecord, {
        serviceToken: SERVICE_TOKEN,
        keyId,
      })
      if (row === null) return null
      return {
        id: row.keyId,
        userId: row.userId,
        scopes: row.scopes,
        status: row.status,
        secretHash: row.secretHash,
      }
    },
  }
}

describe("api key hash compatibility with @cg/auth", () => {
  test("a hash written by issue verifies with verifySecret, and a wrong secret does not", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    const issued = await asUser(t, userId).mutation(api.features.api_keys.mutations.issue, {
      label: "Claude Desktop",
    })
    const parsed = parseToken(TOKEN_PREFIXES.apiKey, issued.key)
    expect(parsed).not.toBeNull()
    expect(parsed?.id).toBe(issued.keyId)

    const stored = await storedHashOf(t, issued.keyId)
    expect(await verifySecret(parsed?.secret ?? "", stored)).toBe(true)

    // A wrong secret of the same shape must not verify — otherwise the test
    // above would pass against an implementation that verifies anything.
    const wrong = `${(parsed?.secret ?? "").slice(0, -1)}${parsed?.secret.endsWith("a") ? "b" : "a"}`
    expect(await verifySecret(wrong, stored)).toBe(false)
    expect(await verifySecret("", stored)).toBe(false)
  })

  test("the stored value has the exact wire format the gateway parses", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    const issued = await asUser(t, userId).mutation(api.features.api_keys.mutations.issue, {
      label: "Cursor",
    })
    const stored = await storedHashOf(t, issued.keyId)

    expect(stored).toMatch(STORED_HASH)
    expect(stored.split("$")[2]).toBe(String(PBKDF2_ITERATIONS))
    // The raw secret must not be recoverable from what was persisted.
    const secret = parseToken(TOKEN_PREFIXES.apiKey, issued.key)?.secret ?? ""
    expect(secret.length).toBeGreaterThan(0)
    expect(stored).not.toContain(secret)
  })

  test("authenticateCaller accepts the raw key end to end, and rejects it once revoked", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const lookup = gatewayLookup(t)

    const issued = await asUser(t, userId).mutation(api.features.api_keys.mutations.issue, {
      label: "Gateway smoke test",
    })

    const principal = await authenticateCaller(issued.key, lookup)
    expect(principal.callerId).toBe(issued.keyId)
    expect(principal.userId).toBe(userId)
    // Least privilege: an issued key grants no scope until one is granted.
    expect(principal.scopes).toEqual([])

    await asUser(t, userId).mutation(api.features.api_keys.mutations.revoke, {
      keyId: issued.keyId,
    })
    await expect(authenticateCaller(issued.key, lookup)).rejects.toThrow(/Invalid credentials/)
  })

  /**
   * The anatomy of the credential, character by character.
   *
   * `formatToken` and `parseToken` share one module, so prefix and separator
   * cannot drift against EACH OTHER — but both can drift away from the string
   * already pasted into every user's MCP client config, and from the dashboard's
   * `API_KEY_TOKEN_PATTERN`. Nothing else pins the literal shape, so this does.
   * The key id owns a `_`, so the split is the LAST separator — the one detail
   * a reimplementation is most likely to get wrong.
   */
  test("the issued key has the exact shape the gateway parses", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const { key, keyId } = await asUser(t, userId).mutation(
      api.features.api_keys.mutations.issue,
      { label: "Shape" },
    )

    expect(key).toMatch(/^cgk_key_[0-9a-f]{32}_[0-9a-f]{64}$/)
    expect(keyId).toMatch(/^key_[0-9a-f]{32}$/)
    expect(key.startsWith(`${TOKEN_PREFIXES.apiKey}_`)).toBe(true)
    // Three separators, and the id owns the middle one.
    expect(key.split("_")).toHaveLength(4)
    expect(key.slice(0, key.lastIndexOf("_"))).toBe(`${TOKEN_PREFIXES.apiKey}_${keyId}`)

    const parsed = parseToken(TOKEN_PREFIXES.apiKey, key)
    expect(parsed?.id).toBe(keyId)
    expect(parsed?.secret).toBe(key.slice(key.lastIndexOf("_") + 1))
    // The secret half carries no `_`, which is what keeps that split unambiguous.
    expect(parsed?.secret).not.toContain("_")
    // A different prefix must not parse the same string.
    expect(parseToken(TOKEN_PREFIXES.device, key)).toBeNull()
  })

  /**
   * The actual front door. Every other test hands `authenticateCaller` the raw
   * string; a real AI client sends a header, and `parseAuthorizationHeader` sits
   * in between on all three HTTP routes. A key that survives every check above
   * but not this one fails only on a live call.
   */
  test("the key authenticates through a real Authorization header", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const issued = await asUser(t, userId).mutation(api.features.api_keys.mutations.issue, {
      label: "Header",
    })

    for (const header of [
      `Bearer ${issued.key}`,
      // RFC 7235: the scheme is case-insensitive, and clients vary.
      `bearer ${issued.key}`,
      `BEARER  ${issued.key} `,
    ]) {
      const token = parseAuthorizationHeader(header)
      expect(token).toBe(issued.key)
      const principal = await authenticateCaller(token ?? "", gatewayLookup(t))
      expect(principal.userId).toBe(userId)
    }
  })

  test("a token whose secret was tampered with is rejected by authenticateCaller", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    const issued = await asUser(t, userId).mutation(api.features.api_keys.mutations.issue, {
      label: "Tampered",
    })
    const tampered = `${issued.key.slice(0, -1)}${issued.key.endsWith("a") ? "b" : "a"}`

    await expect(authenticateCaller(tampered, gatewayLookup(t))).rejects.toThrow(
      /Invalid credentials/,
    )
  })
})
