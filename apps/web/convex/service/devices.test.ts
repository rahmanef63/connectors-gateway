import { describe, expect, test } from "vitest"
import { api } from "../_generated/api"
import {
  asUser,
  createUser,
  expectRejected,
  insertDevice,
  setupConvex,
  SERVICE_TOKEN,
  WRONG_SERVICE_TOKEN,
} from "../test.helpers"

describe("service/devices", () => {
  test("getRecord returns the record for a valid service token", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_one" })

    const record = await t.query(api.service.devices.getRecord, {
      serviceToken: SERVICE_TOKEN,
      deviceId: "dev_one",
    })

    expect(record?.deviceId).toBe("dev_one")
    expect(record?.userId).toBe(userId)
    expect(record?.credentialHash).toBe("pbkdf2$sha256$210000$c2FsdA$aGFzaA")
  })

  test("getRecord rejects a wrong service token", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_one" })

    await expectRejected(
      t.query(api.service.devices.getRecord, {
        serviceToken: WRONG_SERVICE_TOKEN,
        deviceId: "dev_one",
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("getRecord rejects an empty service token", async () => {
    const t = setupConvex()
    await expectRejected(
      t.query(api.service.devices.getRecord, { serviceToken: "", deviceId: "dev_one" }),
      "NOT_AUTHORIZED",
    )
  })

  test("getRecord rejects every caller when the env token is unset", async () => {
    const t = setupConvex()
    delete process.env.GATEWAY_SERVICE_TOKEN
    try {
      await expectRejected(
        t.query(api.service.devices.getRecord, {
          serviceToken: SERVICE_TOKEN,
          deviceId: "dev_one",
        }),
        "NOT_AUTHORIZED",
      )
    } finally {
      process.env.GATEWAY_SERVICE_TOKEN = SERVICE_TOKEN
    }
  })

  test("getRecord is not reachable by a signed-in user without the token", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_one" })

    await expectRejected(
      asUser(t, userId).query(api.service.devices.getRecord, {
        serviceToken: WRONG_SERVICE_TOKEN,
        deviceId: "dev_one",
      }),
      "NOT_AUTHORIZED",
    )
  })

  /**
   * Regression: this used to return null for a revoked device, which made the
   * relay's ONLY revoked branch (apps/gateway store/devices.ts) unreachable —
   * a revoked agent was told "credential rejected, re-pair" (4001) instead of
   * "revoked, stop reconnecting" (4003), and its credential was never hashed,
   * so the two verdicts were trivially distinguishable by timing.
   */
  test("getRecord returns a revoked device WITH its status, so the relay can answer 4003", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_gone", status: "revoked" })

    const record = await t.query(api.service.devices.getRecord, {
      serviceToken: SERVICE_TOKEN,
      deviceId: "dev_gone",
    })

    expect(record?.deviceId).toBe("dev_gone")
    expect(record?.status).toBe("revoked")
  })

  test("getRecord still reports an unknown device as absent", async () => {
    const t = setupConvex()
    const record = await t.query(api.service.devices.getRecord, {
      serviceToken: SERVICE_TOKEN,
      deviceId: "dev_never_existed",
    })

    expect(record).toBeNull()
  })

  test("getRecord rejects a malformed device id", async () => {
    const t = setupConvex()
    await expectRejected(
      t.query(api.service.devices.getRecord, {
        serviceToken: SERVICE_TOKEN,
        deviceId: "../../etc/passwd",
      }),
      "INVALID_INPUT",
    )
  })

  test("listForUser is scoped to one user and includes revoked devices", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await insertDevice(t, mine, { deviceId: "dev_mine" })
    await insertDevice(t, mine, { deviceId: "dev_revoked", status: "revoked" })
    await insertDevice(t, theirs, { deviceId: "dev_theirs" })

    const records = await t.query(api.service.devices.listForUser, {
      serviceToken: SERVICE_TOKEN,
      userId: mine,
    })

    expect(records.map((record) => record.deviceId).sort()).toEqual(["dev_mine", "dev_revoked"])
  })

  test("listForUser rejects a wrong service token", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await expectRejected(
      t.query(api.service.devices.listForUser, {
        serviceToken: WRONG_SERVICE_TOKEN,
        userId,
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("setPresence flips status and records capabilities", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_one" })

    await t.mutation(api.service.devices.setPresence, {
      serviceToken: SERVICE_TOKEN,
      deviceId: "dev_one",
      online: true,
      capabilities: ["blender:scene.inspect"],
    })

    const record = await t.query(api.service.devices.getRecord, {
      serviceToken: SERVICE_TOKEN,
      deviceId: "dev_one",
    })
    expect(record?.status).toBe("online")
    expect(record?.capabilities).toEqual(["blender:scene.inspect"])
    expect(typeof record?.lastSeenAt).toBe("number")
  })

  test("setPresence rejects a wrong service token", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_one" })

    await expectRejected(
      t.mutation(api.service.devices.setPresence, {
        serviceToken: WRONG_SERVICE_TOKEN,
        deviceId: "dev_one",
        online: true,
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("setPresence cannot bring a revoked device back online", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_gone", status: "revoked" })

    await t.mutation(api.service.devices.setPresence, {
      serviceToken: SERVICE_TOKEN,
      deviceId: "dev_gone",
      online: true,
    })

    const stored = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("devices")
        .withIndex("by_deviceId", (q) => q.eq("deviceId", "dev_gone"))
        .take(1)
      return rows[0] ?? null
    })
    expect(stored?.status).toBe("revoked")
  })

  test("setPresence on an unknown device is rejected", async () => {
    const t = setupConvex()
    await expectRejected(
      t.mutation(api.service.devices.setPresence, {
        serviceToken: SERVICE_TOKEN,
        deviceId: "dev_missing",
        online: false,
      }),
      "INVALID_INPUT",
    )
  })
})
