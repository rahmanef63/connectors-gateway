import { describe, expect, test } from "vitest"
import { open, seal } from "@cg/auth"
import { api } from "../../_generated/api"
import {
  asUser,
  createUser,
  expectRejected,
  setupConvex,
  type TestClient,
} from "../../test.helpers"

/** `seal` takes the key as base64; the bytes are what matter, not the spelling. */
function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

/** Shape-valid `v1.<iv>.<cipher>`: 12-byte IV, 16-byte tag, both base64url. */
const SEALED = `v1.${"A".repeat(16)}.${"B".repeat(24)}`
const SEALED_TWO = `v1.${"C".repeat(16)}.${"D".repeat(32)}`
const BASE_URL = "https://public-mcp.example.net/mcp"

async function connectionRows(t: TestClient): Promise<
  Array<{ ownerId: string; connectorId: string; baseUrl: string; tokenCipher: string }>
> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("connections").take(50)
    return rows.map((row) => ({
      ownerId: row.ownerId,
      connectorId: row.connectorId,
      baseUrl: row.baseUrl,
      tokenCipher: row.tokenCipher,
    }))
  })
}

describe("features/connections/mutations:upsert", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    await expectRejected(
      t.mutation(api.features.connections.mutations.upsert, {
        connectorId: "careerpack",
        baseUrl: BASE_URL,
        tokenCipher: SEALED,
        authType: "bearer",
      }),
      "NOT_AUTHORIZED",
    )
    expect(await connectionRows(t)).toEqual([])
  })

  test("stores an active connection owned by the session user", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    const result = await asUser(t, userId).mutation(api.features.connections.mutations.upsert, {
      connectorId: "careerpack",
      baseUrl: BASE_URL,
      tokenCipher: SEALED,
      authType: "bearer",
    })

    expect(typeof result.connectionId).toBe("string")
    const summaries = await asUser(t, userId).query(
      api.features.connections.queries.listMine,
      {},
    )
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.status).toBe("active")
    expect(summaries[0]?.baseUrl).toBe(BASE_URL)
  })

  test("normalises the base URL before storing it", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await asUser(t, userId).mutation(api.features.connections.mutations.upsert, {
      connectorId: "careerpack",
      baseUrl: "https://PUBLIC-MCP.example.net/mcp/?token=abc#frag",
      tokenCipher: SEALED,
      authType: "bearer",
    })
    expect((await connectionRows(t))[0]?.baseUrl).toBe(BASE_URL)
  })

  test("stores renewable metadata sealed and resets it on a later token-paste reconnect", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const client = asUser(t, userId)
    const expiresAt = Date.now() + 3_600_000

    await client.mutation(api.features.connections.mutations.upsert, {
      connectorId: "careerpack",
      baseUrl: BASE_URL,
      tokenCipher: SEALED,
      tokenExpiresAt: expiresAt,
      renewalCipher: SEALED_TWO,
      authType: "bearer",
    })
    let stored = await t.run(async (ctx) => ctx.db.query("connections").first())
    expect(stored).toMatchObject({
      tokenExpiresAt: expiresAt,
      renewalCipher: SEALED_TWO,
      credentialVersion: 1,
    })

    await client.mutation(api.features.connections.mutations.upsert, {
      connectorId: "careerpack",
      baseUrl: BASE_URL,
      tokenCipher: SEALED_TWO,
      authType: "bearer",
    })
    stored = await t.run(async (ctx) => ctx.db.query("connections").first())
    expect(stored?.credentialVersion).toBe(2)
    expect(stored?.tokenExpiresAt).toBeUndefined()
    expect(stored?.renewalCipher).toBeUndefined()
    expect(stored?.refreshLeaseId).toBeUndefined()
  })

  test("refuses renewal ciphertext without a schedulable expiry", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await expectRejected(
      asUser(t, userId).mutation(api.features.connections.mutations.upsert, {
        connectorId: "careerpack",
        baseUrl: BASE_URL,
        tokenCipher: SEALED,
        renewalCipher: SEALED_TWO,
        authType: "bearer",
      }),
      "INVALID_INPUT",
    )
  })

  test("a second upsert updates the same row instead of duplicating it", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const client = asUser(t, userId)

    const first = await client.mutation(api.features.connections.mutations.upsert, {
      connectorId: "careerpack",
      baseUrl: BASE_URL,
      tokenCipher: SEALED,
      authType: "bearer",
    })
    const second = await client.mutation(api.features.connections.mutations.upsert, {
      connectorId: "careerpack",
      baseUrl: "https://other.convex.site/mcp",
      tokenCipher: SEALED_TWO,
      authType: "api_key",
    })

    expect(second.connectionId).toBe(first.connectionId)
    const rows = await connectionRows(t)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.baseUrl).toBe("https://other.convex.site/mcp")
    expect(rows[0]?.tokenCipher).toBe(SEALED_TWO)
  })

  test("a different connector gets its own row", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const client = asUser(t, userId)
    for (const connectorId of ["careerpack", "blender"]) {
      await client.mutation(api.features.connections.mutations.upsert, {
        connectorId,
        baseUrl: BASE_URL,
        tokenCipher: SEALED,
        authType: "bearer",
      })
    }
    expect(await connectionRows(t)).toHaveLength(2)
  })

  test("rejects a tokenCipher that is not a sealed envelope", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const client = asUser(t, userId)

    for (const tokenCipher of [
      "",
      "sk-live-plaintext-token",
      "v1.SEALED-CIPHERTEXT",
      `v2.${"A".repeat(16)}.${"B".repeat(24)}`,
      `v1.${"A".repeat(8)}.${"B".repeat(24)}`,
      `v1.${"A".repeat(16)}.${"B".repeat(4)}`,
      `v1.${"A".repeat(16)}.${"B".repeat(20)}!!`,
      `v1.${"A".repeat(16)}.${"B".repeat(70 * 1024)}`,
    ]) {
      await expectRejected(
        client.mutation(api.features.connections.mutations.upsert, {
          connectorId: "careerpack",
          baseUrl: BASE_URL,
          tokenCipher,
          authType: "bearer",
        }),
        "INVALID_INPUT",
      )
    }
    expect(await connectionRows(t)).toEqual([])
  })

  /**
   * The drift guard on the envelope shape. Every other case in this file uses a
   * HAND-WRITTEN `v1.AAA….BBB…`, which only ever proves the regex matches
   * itself. If `@cg/auth`'s `seal` changed its IV length, its version tag or its
   * alphabet, those cases would all still pass while `upsert` rejected every
   * real credential the operator produced — the feature would be dead on
   * arrival with a green suite. So these feed the validator actual `seal`
   * output, including the degenerate shortest one it can ever emit.
   */
  test("accepts what @cg/auth's seal actually emits, and stores it openable", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const client = asUser(t, userId)
    const key = toBase64(crypto.getRandomValues(new Uint8Array(32)))

    const tokens = [
      // Empty plaintext is the shortest envelope possible: 16 bytes of GCM tag
      // and nothing else, which is exactly the 22 base64url characters the
      // pattern's lower bound allows. One character stricter rejects it.
      "",
      "sk-careerpack-live-abc123",
      `ghp_${"y".repeat(36)}`,
      "токен-日本語",
      "x".repeat(1000),
    ]

    for (const [index, token] of tokens.entries()) {
      const tokenCipher = await seal(token, key)
      await client.mutation(api.features.connections.mutations.upsert, {
        connectorId: `connector-${index}`,
        baseUrl: BASE_URL,
        tokenCipher,
        authType: "bearer",
      })

      const row = (await connectionRows(t)).find((r) => r.connectorId === `connector-${index}`)
      // Stored byte for byte — a normalising write would corrupt the ciphertext
      // and only show up as an opaque INTERNAL error at call time.
      expect(row?.tokenCipher).toBe(tokenCipher)
      // …and the gateway can still open what the control plane wrote down.
      expect(await open(row?.tokenCipher ?? "", key)).toBe(token)
    }
  })

  test("rejects an SSRF base URL and writes nothing", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const client = asUser(t, userId)

    for (const baseUrl of [
      "http://169.254.169.254/latest/meta-data",
      "https://user:pass@example.com",
      "https://[::ffff:169.254.169.254]/mcp",
      "https://10.0.0.5/mcp",
      "https://api-connectors.rahmanef.com/mcp",
    ]) {
      await expectRejected(
        client.mutation(api.features.connections.mutations.upsert, {
          connectorId: "careerpack",
          baseUrl,
          tokenCipher: SEALED,
          authType: "bearer",
        }),
        "INVALID_INPUT",
      )
    }
    expect(await connectionRows(t)).toEqual([])
  })

  test("rejects a connectorId that is not an identifier", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await expectRejected(
      asUser(t, userId).mutation(api.features.connections.mutations.upsert, {
        connectorId: "../../etc/passwd",
        baseUrl: BASE_URL,
        tokenCipher: SEALED,
        authType: "bearer",
      }),
      "INVALID_INPUT",
    )
  })
})

describe("features/connections/mutations:remove", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    await expectRejected(
      t.mutation(api.features.connections.mutations.remove, { connectorId: "careerpack" }),
      "NOT_AUTHORIZED",
    )
  })

  test("deletes the caller's connection and is idempotent", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const client = asUser(t, userId)
    await client.mutation(api.features.connections.mutations.upsert, {
      connectorId: "careerpack",
      baseUrl: BASE_URL,
      tokenCipher: SEALED,
      authType: "bearer",
    })

    await client.mutation(api.features.connections.mutations.remove, { connectorId: "careerpack" })
    expect(await connectionRows(t)).toEqual([])
    // Removing again is a no-op, not an error: no existence oracle.
    await client.mutation(api.features.connections.mutations.remove, { connectorId: "careerpack" })
    expect(await connectionRows(t)).toEqual([])
  })

  test("leaves another user's connection for the same connector untouched", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)

    await asUser(t, theirs).mutation(api.features.connections.mutations.upsert, {
      connectorId: "careerpack",
      baseUrl: "https://theirs.convex.site/mcp",
      tokenCipher: SEALED_TWO,
      authType: "bearer",
    })
    await asUser(t, mine).mutation(api.features.connections.mutations.remove, {
      connectorId: "careerpack",
    })

    const rows = await connectionRows(t)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.ownerId).toBe(theirs)
    // …and it was never visible to the other user in the first place.
    expect(await asUser(t, mine).query(api.features.connections.queries.listMine, {})).toEqual([])
  })

  test("one user's upsert cannot overwrite another user's row", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)

    await asUser(t, theirs).mutation(api.features.connections.mutations.upsert, {
      connectorId: "careerpack",
      baseUrl: "https://theirs.convex.site/mcp",
      tokenCipher: SEALED_TWO,
      authType: "bearer",
    })
    await asUser(t, mine).mutation(api.features.connections.mutations.upsert, {
      connectorId: "careerpack",
      baseUrl: BASE_URL,
      tokenCipher: SEALED,
      authType: "bearer",
    })

    const rows = await connectionRows(t)
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.ownerId === theirs)?.baseUrl).toBe(
      "https://theirs.convex.site/mcp",
    )
  })
})
