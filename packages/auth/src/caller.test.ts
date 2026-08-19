import { beforeAll, describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import {
  type ApiKeyLookup,
  type ApiKeyRecord,
  authenticateCaller,
  parseAuthorizationHeader,
} from "./caller"
import { hashSecret } from "./hash"
import { TOKEN_PREFIXES, formatToken, newCredentialSecret } from "./tokens"

const SECRET = newCredentialSecret()
const KEY_ID = "key_live_1"
let record: ApiKeyRecord

beforeAll(async () => {
  record = {
    id: KEY_ID,
    userId: "user_1",
    workspaceId: "ws_1",
    scopes: ["connector:*"],
    status: "active",
    secretHash: await hashSecret(SECRET),
  }
})

function lookupOf(row: ApiKeyRecord | null): ApiKeyLookup {
  return { getApiKey: async (keyId) => (row && row.id === keyId ? row : null) }
}

const token = () => formatToken(TOKEN_PREFIXES.apiKey, KEY_ID, SECRET)

async function codeAndMessage(promise: Promise<unknown>): Promise<[string, string]> {
  try {
    await promise
    throw new Error("expected a rejection")
  } catch (error) {
    expect(error).toBeInstanceOf(GatewayError)
    const gatewayError = error as GatewayError
    return [gatewayError.code, gatewayError.message]
  }
}

describe("parseAuthorizationHeader", () => {
  test("accepts any casing of the scheme", () => {
    expect(parseAuthorizationHeader("Bearer abc")).toBe("abc")
    expect(parseAuthorizationHeader("bearer abc")).toBe("abc")
    expect(parseAuthorizationHeader("BEARER abc")).toBe("abc")
    expect(parseAuthorizationHeader("  Bearer   abc  ")).toBe("abc")
  })

  test("DENIED: anything that is not a single bearer token", () => {
    for (const header of [
      "",
      "abc",
      "Bearer",
      "Bearer ",
      "Basic abc",
      "Bearerabc",
      "Bearer abc def",
      null,
      undefined,
      42 as unknown as string,
    ]) {
      expect(parseAuthorizationHeader(header)).toBeNull()
    }
  })
})

describe("authenticateCaller", () => {
  test("returns the server-side principal", async () => {
    const principal = await authenticateCaller(token(), lookupOf(record))
    expect(principal).toEqual({
      callerId: KEY_ID,
      userId: "user_1",
      scopes: ["connector:*"],
      workspaceId: "ws_1",
    })
  })

  test("omits workspaceId when the key has none", async () => {
    const personal: ApiKeyRecord = { ...record, workspaceId: undefined }
    const principal = await authenticateCaller(token(), lookupOf(personal))
    expect("workspaceId" in principal).toBe(false)
  })

  test("DENIED: unknown key and wrong secret are indistinguishable", async () => {
    const unknown = await codeAndMessage(authenticateCaller(token(), lookupOf(null)))
    const wrongSecret = await codeAndMessage(
      authenticateCaller(
        formatToken(TOKEN_PREFIXES.apiKey, KEY_ID, newCredentialSecret()),
        lookupOf(record),
      ),
    )
    expect(unknown).toEqual(["NOT_AUTHENTICATED", "Invalid credentials."])
    expect(wrongSecret).toEqual(unknown)
  })

  test("DENIED: revoked and expired keys, same error", async () => {
    const revoked = await codeAndMessage(
      authenticateCaller(token(), lookupOf({ ...record, status: "revoked" })),
    )
    const expiredStatus = await codeAndMessage(
      authenticateCaller(token(), lookupOf({ ...record, status: "expired" })),
    )
    const expiredAt = await codeAndMessage(
      authenticateCaller(token(), lookupOf({ ...record, expiresAt: 1_000 }), 2_000),
    )
    expect(revoked).toEqual(["NOT_AUTHENTICATED", "Invalid credentials."])
    expect(expiredStatus).toEqual(revoked)
    expect(expiredAt).toEqual(revoked)
  })

  test("allows an audience-bound token only at its exact MCP resource", async () => {
    const audience = "https://connect.example/mcp"
    const bound = { ...record, audience }
    expect((await authenticateCaller(token(), lookupOf(bound), 1_000, audience)).callerId).toBe(KEY_ID)
    expect(
      await codeAndMessage(
        authenticateCaller(token(), lookupOf(bound), 1_000, "https://other.example/mcp"),
      ),
    ).toEqual(["NOT_AUTHENTICATED", "Invalid credentials."])
    // No audience context means a REST endpoint, which must reject an MCP token.
    expect(await codeAndMessage(authenticateCaller(token(), lookupOf(bound), 1_000))).toEqual([
      "NOT_AUTHENTICATED",
      "Invalid credentials.",
    ])
  })

  test("allows a key whose expiry is still in the future", async () => {
    const principal = await authenticateCaller(
      token(),
      lookupOf({ ...record, expiresAt: 5_000 }),
      1_000,
    )
    expect(principal.callerId).toBe(KEY_ID)
  })

  test("DENIED: malformed token, device-prefixed token, and raw secret", async () => {
    for (const value of [
      "",
      "not-a-token",
      formatToken(TOKEN_PREFIXES.device, KEY_ID, SECRET),
      SECRET,
    ]) {
      const [code, message] = await codeAndMessage(authenticateCaller(value, lookupOf(record)))
      expect([code, message]).toEqual(["NOT_AUTHENTICATED", "Invalid credentials."])
    }
  })

  test("DENIED: a malformed store row is treated as unknown, never trusted", async () => {
    const junk = { id: KEY_ID, userId: 7, scopes: "all" } as unknown as ApiKeyRecord
    const [code] = await codeAndMessage(
      authenticateCaller(token(), { getApiKey: async () => junk }),
    )
    expect(code).toBe("NOT_AUTHENTICATED")
  })

  test("DENIED: a lookup failure does not leak the underlying error", async () => {
    const failing: ApiKeyLookup = {
      getApiKey: async () => {
        throw new Error("convex: table api_keys does not exist")
      },
    }
    const throwingSync: ApiKeyLookup = {
      getApiKey: (() => {
        throw new Error("control plane unreachable")
      }) as ApiKeyLookup["getApiKey"],
    }
    const [code, message] = await codeAndMessage(authenticateCaller(token(), failing))
    expect([code, message]).toEqual(["NOT_AUTHENTICATED", "Invalid credentials."])
    expect(await codeAndMessage(authenticateCaller(token(), throwingSync))).toEqual([
      "NOT_AUTHENTICATED",
      "Invalid credentials.",
    ])
  })

  test("never echoes the presented secret in the error message", async () => {
    const [, message] = await codeAndMessage(authenticateCaller(token(), lookupOf(null)))
    expect(message.includes(SECRET)).toBe(false)
    expect(message.includes(KEY_ID)).toBe(false)
  })
})
