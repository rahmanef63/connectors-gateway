/**
 * Authorized and denied paths for issue / listMine / revoke.
 * The hash-format compatibility with `@cg/auth` lives in `compat.test.ts`.
 */
import { describe, expect, test } from "vitest"
import { api } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import {
  asUser,
  createUser,
  expectRejected,
  setupConvex,
  SERVICE_TOKEN,
  type TestClient,
} from "../../test.helpers"
import { MAX_ACTIVE_API_KEYS_PER_USER } from "./limits"

/** Long enough for the cap test: each issue runs a real 210k-iteration PBKDF2. */
const SLOW = 60_000

async function issueKey(
  t: TestClient,
  userId: Id<"users">,
  label = "Claude Desktop",
): Promise<{ key: string; keyId: string }> {
  return await asUser(t, userId).mutation(api.features.api_keys.mutations.issue, { label })
}

describe("features/api_keys/mutations:issue", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    await expectRejected(
      t.mutation(api.features.api_keys.mutations.issue, { label: "Claude Desktop" }),
      "NOT_AUTHORIZED",
    )
  })

  test("returns the raw key exactly once and never through any other read", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    const issued = await issueKey(t, userId)
    expect(issued.key.startsWith(`cgk_${issued.keyId}_`)).toBe(true)

    const listed = await asUser(t, userId).query(api.features.api_keys.queries.listMine, {})
    expect(listed).toHaveLength(1)
    expect(listed[0]?.keyId).toBe(issued.keyId)
    // Neither the whole key, nor the secret half, nor the hash may appear.
    // The secret is everything after the LAST `_` — the key id contains one too.
    const secret = issued.key.slice(issued.key.lastIndexOf("_") + 1)
    expect(secret.length).toBeGreaterThan(32)
    const serialized = JSON.stringify(listed)
    expect(serialized).not.toContain(issued.key)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain("pbkdf2")
    expect(listed[0]).not.toHaveProperty("secretHash")
    expect(listed[0]).not.toHaveProperty("key")
  })

  test("issues an active key with a trimmed label and no scopes", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    const issued = await issueKey(t, userId, "   Cursor   ")

    const listed = await asUser(t, userId).query(api.features.api_keys.queries.listMine, {})
    expect(listed[0]?.label).toBe("Cursor")
    expect(listed[0]?.status).toBe("active")
    expect(typeof listed[0]?.createdAt).toBe("number")

    const record = await t.query(api.service.apiKeys.getRecord, {
      serviceToken: SERVICE_TOKEN,
      keyId: issued.keyId,
    })
    expect(record?.userId).toBe(userId)
    expect(record?.scopes).toEqual([])
  })

  test("two keys never collide on key id or secret", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    const first = await issueKey(t, userId, "One")
    const second = await issueKey(t, userId, "Two")

    expect(first.keyId).not.toBe(second.keyId)
    expect(first.key).not.toBe(second.key)
  })

  test("rejects an empty, whitespace-only or over-long label", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    // NUL as an ESCAPE, never a literal byte: a raw NUL would make this whole
    // file binary, and grep, diffs and review tooling then skip it silently.
    for (const label of ["", "   ", "x".repeat(65), "bad\u0000label", "tab\tlabel"]) {
      await expectRejected(
        asUser(t, userId).mutation(api.features.api_keys.mutations.issue, { label }),
        "INVALID_INPUT",
      )
    }
    const listed = await asUser(t, userId).query(api.features.api_keys.queries.listMine, {})
    expect(listed).toHaveLength(0)
  })

  test(
    "holds the active-key cap, and revoking frees a slot",
    async () => {
      const t = setupConvex()
      const userId = await createUser(t)

      const issued: string[] = []
      for (let i = 0; i < MAX_ACTIVE_API_KEYS_PER_USER; i += 1) {
        issued.push((await issueKey(t, userId, `Key ${i}`)).keyId)
      }

      await expectRejected(
        asUser(t, userId).mutation(api.features.api_keys.mutations.issue, { label: "One too many" }),
        "RATE_LIMITED",
      )

      await asUser(t, userId).mutation(api.features.api_keys.mutations.revoke, {
        keyId: issued[0] as string,
      })
      // A revoked key no longer occupies a slot, but its row still exists.
      await issueKey(t, userId, "Replacement")

      const listed = await asUser(t, userId).query(api.features.api_keys.queries.listMine, {})
      expect(listed).toHaveLength(MAX_ACTIVE_API_KEYS_PER_USER + 1)
      expect(listed.filter((row) => row.status === "active")).toHaveLength(
        MAX_ACTIVE_API_KEYS_PER_USER,
      )
    },
    SLOW,
  )

  test("one user's cap does not spend another user's", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)

    await issueKey(t, mine, "Mine")
    await issueKey(t, theirs, "Theirs")

    const listed = await asUser(t, mine).query(api.features.api_keys.queries.listMine, {})
    expect(listed).toHaveLength(1)
    expect(listed[0]?.label).toBe("Mine")
  })
})

describe("features/api_keys/queries:listMine", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await issueKey(t, userId)

    await expectRejected(t.query(api.features.api_keys.queries.listMine, {}), "NOT_AUTHORIZED")
  })

  test("never shows another user's key", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    const foreign = await issueKey(t, theirs, "Theirs")

    const listed = await asUser(t, mine).query(api.features.api_keys.queries.listMine, {})

    expect(listed).toHaveLength(0)
    expect(JSON.stringify(listed)).not.toContain(foreign.keyId)
  })
})

describe("features/api_keys/mutations:revoke", () => {
  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const issued = await issueKey(t, userId)

    await expectRejected(
      t.mutation(api.features.api_keys.mutations.revoke, { keyId: issued.keyId }),
      "NOT_AUTHORIZED",
    )

    const record = await t.query(api.service.apiKeys.getRecord, {
      serviceToken: SERVICE_TOKEN,
      keyId: issued.keyId,
    })
    expect(record?.status).toBe("active")
  })

  test("is terminal and idempotent, and the row survives for the gateway", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const issued = await issueKey(t, userId)

    await asUser(t, userId).mutation(api.features.api_keys.mutations.revoke, {
      keyId: issued.keyId,
    })
    await asUser(t, userId).mutation(api.features.api_keys.mutations.revoke, {
      keyId: issued.keyId,
    })

    // The gateway must be able to tell "revoked" from "unknown".
    const record = await t.query(api.service.apiKeys.getRecord, {
      serviceToken: SERVICE_TOKEN,
      keyId: issued.keyId,
    })
    expect(record?.status).toBe("revoked")
    expect(record?.secretHash).toMatch(/^pbkdf2\$/)

    const listed = await asUser(t, userId).query(api.features.api_keys.queries.listMine, {})
    expect(listed[0]?.status).toBe("revoked")
  })

  test("cannot revoke another user's key, and says the same thing as for an unknown key", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    const foreign = await issueKey(t, theirs, "Theirs")

    const foreignError = await rejectionOf(
      asUser(t, mine).mutation(api.features.api_keys.mutations.revoke, { keyId: foreign.keyId }),
    )
    const unknownError = await rejectionOf(
      asUser(t, mine).mutation(api.features.api_keys.mutations.revoke, {
        keyId: "key_00000000000000000000000000000000",
      }),
    )
    // No existence oracle: identical code AND identical message.
    expect(foreignError).toEqual(unknownError)
    expect(foreignError.code).toBe("NOT_AUTHORIZED")

    const record = await t.query(api.service.apiKeys.getRecord, {
      serviceToken: SERVICE_TOKEN,
      keyId: foreign.keyId,
    })
    expect(record?.status).toBe("active")
  })

  test("rejects a malformed key id", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    await expectRejected(
      asUser(t, userId).mutation(api.features.api_keys.mutations.revoke, { keyId: "not a key id" }),
      "INVALID_INPUT",
    )
  })
})

/** The thrown payload, so two denials can be compared field by field. */
async function rejectionOf(call: Promise<unknown>): Promise<{ code: unknown; message: unknown }> {
  try {
    await call
  } catch (error) {
    const data: unknown = (error as { data?: unknown }).data
    if (typeof data === "object" && data !== null) {
      return data as { code: unknown; message: unknown }
    }
    return { code: String(error), message: String(error) }
  }
  throw new Error("Expected the call to be rejected.")
}
