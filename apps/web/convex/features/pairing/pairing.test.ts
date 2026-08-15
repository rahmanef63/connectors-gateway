import { describe, expect, test } from "vitest"
import { api } from "../../_generated/api"
import {
  asUser,
  createUser,
  expectRejected,
  setupConvex,
  SERVICE_TOKEN,
  type TestClient,
} from "../../test.helpers"

const HOUR = 60 * 60 * 1000

async function createChallenge(t: TestClient, code = "ABCD1234", expiresAt = Date.now() + HOUR) {
  return await t.mutation(api.service.pairing.createChallenge, {
    serviceToken: SERVICE_TOKEN,
    id: `pair_${code.toLowerCase()}`,
    code,
    deviceName: "Studio laptop",
    platform: "macos",
    expiresAt,
  })
}

describe("features/pairing/queries:getByCode", () => {
  test("shows a pending prompt to any signed-in user", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await createChallenge(t)

    const prompt = await asUser(t, userId).query(api.features.pairing.queries.getByCode, {
      code: "abcd1234",
    })

    expect(prompt?.deviceName).toBe("Studio laptop")
    expect(prompt?.status).toBe("pending")
  })

  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    await createChallenge(t)

    await expectRejected(
      t.query(api.features.pairing.queries.getByCode, { code: "ABCD1234" }),
      "NOT_AUTHORIZED",
    )
  })

  test("hides a challenge already bound to another user", async () => {
    const t = setupConvex()
    const owner = await createUser(t)
    const stranger = await createUser(t)
    await createChallenge(t)
    await asUser(t, owner).mutation(api.features.pairing.mutations.approve, { code: "ABCD1234" })

    const prompt = await asUser(t, stranger).query(api.features.pairing.queries.getByCode, {
      code: "ABCD1234",
    })
    expect(prompt).toBeNull()
  })

  test("rejects a malformed code without touching the table", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    await expectRejected(
      asUser(t, userId).query(api.features.pairing.queries.getByCode, { code: "ab" }),
      "INVALID_INPUT",
    )
  })
})

describe("features/pairing/mutations:approve", () => {
  test("binds the challenge to the approving user", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await createChallenge(t)

    await asUser(t, userId).mutation(api.features.pairing.mutations.approve, { code: "ABCD1234" })

    const challenge = await t.query(api.service.pairing.getByCode, {
      serviceToken: SERVICE_TOKEN,
      code: "ABCD1234",
    })
    expect(challenge?.status).toBe("approved")
    expect(challenge?.userId).toBe(userId)
  })

  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    await createChallenge(t)

    await expectRejected(
      t.mutation(api.features.pairing.mutations.approve, { code: "ABCD1234" }),
      "NOT_AUTHORIZED",
    )
  })

  test("cannot re-bind a challenge another user already approved", async () => {
    const t = setupConvex()
    const owner = await createUser(t)
    const stranger = await createUser(t)
    await createChallenge(t)
    await asUser(t, owner).mutation(api.features.pairing.mutations.approve, { code: "ABCD1234" })

    await expectRejected(
      asUser(t, stranger).mutation(api.features.pairing.mutations.approve, { code: "ABCD1234" }),
      "NOT_AUTHORIZED",
    )

    const challenge = await t.query(api.service.pairing.getByCode, {
      serviceToken: SERVICE_TOKEN,
      code: "ABCD1234",
    })
    expect(challenge?.userId).toBe(owner)
  })

  test("cannot approve an expired challenge", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await createChallenge(t)
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("pairingChallenges")
        .withIndex("by_code", (q) => q.eq("code", "ABCD1234"))
        .take(1)
      const row = rows[0]
      if (row === undefined) throw new Error("fixture challenge missing")
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 })
    })

    await expectRejected(
      asUser(t, userId).mutation(api.features.pairing.mutations.approve, { code: "ABCD1234" }),
      "INVALID_INPUT",
    )
  })

  test("cannot approve an unknown code", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    await expectRejected(
      asUser(t, userId).mutation(api.features.pairing.mutations.approve, { code: "ZZZZ9999" }),
      "INVALID_INPUT",
    )
  })

  test("approving twice is refused, so a claimed challenge cannot be reopened", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const challenge = await createChallenge(t)
    await asUser(t, userId).mutation(api.features.pairing.mutations.approve, { code: "ABCD1234" })
    await t.mutation(api.service.pairing.claim, {
      serviceToken: SERVICE_TOKEN,
      challengeId: challenge.id,
      deviceId: "dev_claimed",
      credentialHash: "pbkdf2$sha256$210000$c2FsdA$aGFzaA",
    })

    await expectRejected(
      asUser(t, userId).mutation(api.features.pairing.mutations.approve, { code: "ABCD1234" }),
      "INVALID_INPUT",
    )
  })
})
