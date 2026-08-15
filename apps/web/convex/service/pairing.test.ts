import { describe, expect, test } from "vitest"
import { api } from "../_generated/api"
import {
  createUser,
  expectRejected,
  setupConvex,
  SERVICE_TOKEN,
  WRONG_SERVICE_TOKEN,
  type TestClient,
} from "../test.helpers"

const HOUR = 60 * 60 * 1000

async function createChallenge(t: TestClient, code = "ABCD1234", expiresAt = Date.now() + HOUR) {
  return await t.mutation(api.service.pairing.createChallenge, {
    serviceToken: SERVICE_TOKEN,
    id: `pair_${code.toLowerCase()}`,
    code,
    deviceName: "Studio laptop",
    platform: "linux",
    expiresAt,
  })
}

/** Approve without going through the dashboard, to isolate the claim path. */
async function approve(t: TestClient, code: string, userId: string) {
  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("pairingChallenges")
      .withIndex("by_code", (q) => q.eq("code", code))
      .take(1)
    const row = rows[0]
    if (row === undefined) throw new Error("fixture challenge missing")
    await ctx.db.patch(row._id, { status: "approved", userId })
  })
}

describe("service/pairing", () => {
  test("createChallenge stores a pending challenge", async () => {
    const t = setupConvex()
    const challenge = await createChallenge(t)
    expect(challenge.status).toBe("pending")
    expect(challenge.code).toBe("ABCD1234")
    expect(challenge.id).toBe("pair_abcd1234")
  })

  test("createChallenge rejects a wrong service token", async () => {
    const t = setupConvex()
    await expectRejected(
      t.mutation(api.service.pairing.createChallenge, {
        serviceToken: WRONG_SERVICE_TOKEN,
        id: "pair_x1",
        code: "ABCD1234",
        deviceName: "Studio laptop",
        platform: "linux",
        expiresAt: Date.now() + HOUR,
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("createChallenge refuses a past expiry and a duplicate code", async () => {
    const t = setupConvex()
    await expectRejected(createChallenge(t, "ABCD1234", Date.now() - 1), "INVALID_INPUT")
    await createChallenge(t, "ABCD1234")
    await expectRejected(createChallenge(t, "ABCD1234"), "INVALID_INPUT")
  })

  test("createChallenge truncates a long device name but refuses a blank one", async () => {
    const t = setupConvex()
    const long = await t.mutation(api.service.pairing.createChallenge, {
      serviceToken: SERVICE_TOKEN,
      id: "pair_long",
      code: "LONG1234",
      deviceName: "n".repeat(200),
      platform: "windows",
      expiresAt: Date.now() + HOUR,
    })
    expect(long.deviceName).toHaveLength(64)

    await expectRejected(
      t.mutation(api.service.pairing.createChallenge, {
        serviceToken: SERVICE_TOKEN,
        id: "pair_blank",
        code: "BLNK1234",
        deviceName: "   ",
        platform: "windows",
        expiresAt: Date.now() + HOUR,
      }),
      "INVALID_INPUT",
    )
  })

  test("getByCode reads back the challenge and rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    await createChallenge(t)

    const found = await t.query(api.service.pairing.getByCode, {
      serviceToken: SERVICE_TOKEN,
      code: "ABCD1234",
    })
    expect(found?.deviceName).toBe("Studio laptop")

    await expectRejected(
      t.query(api.service.pairing.getByCode, {
        serviceToken: WRONG_SERVICE_TOKEN,
        code: "ABCD1234",
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("getByCode reports a lapsed pending challenge as expired", async () => {
    const t = setupConvex()
    await createChallenge(t, "ABCD1234", Date.now() + 5)
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("pairingChallenges")
        .withIndex("by_code", (q) => q.eq("code", "ABCD1234"))
        .take(1)
      const row = rows[0]
      if (row === undefined) throw new Error("fixture challenge missing")
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 })
    })

    const found = await t.query(api.service.pairing.getByCode, {
      serviceToken: SERVICE_TOKEN,
      code: "ABCD1234",
    })
    expect(found?.status).toBe("expired")
  })

  test("claim creates the device once and returns null on the second call", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const challenge = await createChallenge(t)
    await approve(t, challenge.code, userId)

    const first = await t.mutation(api.service.pairing.claim, {
      serviceToken: SERVICE_TOKEN,
      challengeId: challenge.id,
      deviceId: "dev_claimed",
      credentialHash: "pbkdf2$sha256$210000$c2FsdA$aGFzaA",
    })
    expect(first?.device.deviceId).toBe("dev_claimed")
    expect(first?.device.userId).toBe(userId)
    expect(first?.device.status).toBe("offline")
    expect(first?.device.credentialVersion).toBe(1)

    const second = await t.mutation(api.service.pairing.claim, {
      serviceToken: SERVICE_TOKEN,
      challengeId: challenge.id,
      deviceId: "dev_second",
      credentialHash: "pbkdf2$sha256$210000$c2FsdA$aGFzaA",
    })
    expect(second).toBeNull()

    const deviceCount = await t.run(async (ctx) => (await ctx.db.query("devices").take(10)).length)
    expect(deviceCount).toBe(1)
  })

  test("claim rejects a wrong service token", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const challenge = await createChallenge(t)
    await approve(t, challenge.code, userId)

    await expectRejected(
      t.mutation(api.service.pairing.claim, {
        serviceToken: WRONG_SERVICE_TOKEN,
        challengeId: challenge.id,
        deviceId: "dev_claimed",
        credentialHash: "hash",
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("an unapproved challenge cannot be claimed", async () => {
    const t = setupConvex()
    const challenge = await createChallenge(t)

    const claimed = await t.mutation(api.service.pairing.claim, {
      serviceToken: SERVICE_TOKEN,
      challengeId: challenge.id,
      deviceId: "dev_claimed",
      credentialHash: "hash",
    })

    expect(claimed).toBeNull()
    const deviceCount = await t.run(async (ctx) => (await ctx.db.query("devices").take(10)).length)
    expect(deviceCount).toBe(0)
  })

  test("an expired challenge cannot be claimed even once approved", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const challenge = await createChallenge(t)
    await approve(t, challenge.code, userId)
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("pairingChallenges")
        .withIndex("by_code", (q) => q.eq("code", challenge.code))
        .take(1)
      const row = rows[0]
      if (row === undefined) throw new Error("fixture challenge missing")
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 })
    })

    const claimed = await t.mutation(api.service.pairing.claim, {
      serviceToken: SERVICE_TOKEN,
      challengeId: challenge.id,
      deviceId: "dev_claimed",
      credentialHash: "hash",
    })

    expect(claimed).toBeNull()
    const status = await t.query(api.service.pairing.getByCode, {
      serviceToken: SERVICE_TOKEN,
      code: challenge.code,
    })
    expect(status?.status).toBe("expired")
  })

  test("claiming an unknown challenge returns null and writes nothing", async () => {
    const t = setupConvex()
    const claimed = await t.mutation(api.service.pairing.claim, {
      serviceToken: SERVICE_TOKEN,
      challengeId: "pair_missing",
      deviceId: "dev_claimed",
      credentialHash: "hash",
    })
    expect(claimed).toBeNull()
  })

  test("claim refuses an empty credential hash", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const challenge = await createChallenge(t)
    await approve(t, challenge.code, userId)

    await expectRejected(
      t.mutation(api.service.pairing.claim, {
        serviceToken: SERVICE_TOKEN,
        challengeId: challenge.id,
        deviceId: "dev_claimed",
        credentialHash: "",
      }),
      "INVALID_INPUT",
    )
  })
})
