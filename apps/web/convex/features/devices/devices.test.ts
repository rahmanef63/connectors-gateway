import { PRESENCE_TTL_MS } from "@cg/core"
import { describe, expect, test } from "vitest"
import { api } from "../../_generated/api"
import {
  asUser,
  createUser,
  expectRejected,
  insertDevice,
  setupConvex,
  SERVICE_TOKEN,
} from "../../test.helpers"

describe("features/devices/queries:listMine", () => {
  test("returns only the caller's devices and never a credential hash", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await insertDevice(t, mine, { deviceId: "dev_mine" })
    await insertDevice(t, theirs, { deviceId: "dev_theirs" })

    const devices = await asUser(t, mine).query(api.features.devices.queries.listMine, {})

    expect(devices).toHaveLength(1)
    expect(devices[0]?.deviceId).toBe("dev_mine")
    expect(JSON.stringify(devices)).not.toContain("pbkdf2")
    expect(devices[0]).not.toHaveProperty("credentialHash")
  })

  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_mine" })

    await expectRejected(t.query(api.features.devices.queries.listMine, {}), "NOT_AUTHORIZED")
  })
})

describe("features/devices/mutations:revoke", () => {
  test("flips status, and the gateway sees the revoked status on its next lookup", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_mine", status: "online" })

    await asUser(t, userId).mutation(api.features.devices.mutations.revoke, {
      deviceId: "dev_mine",
    })

    const summary = await asUser(t, userId).query(api.features.devices.queries.listMine, {})
    expect(summary[0]?.status).toBe("revoked")

    // The gateway rejects it (twice), but it has to be able to SEE it first.
    const record = await t.query(api.service.devices.getRecord, {
      serviceToken: SERVICE_TOKEN,
      deviceId: "dev_mine",
    })
    expect(record?.status).toBe("revoked")
  })

  test("is idempotent", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_mine" })

    await asUser(t, userId).mutation(api.features.devices.mutations.revoke, { deviceId: "dev_mine" })
    await asUser(t, userId).mutation(api.features.devices.mutations.revoke, { deviceId: "dev_mine" })

    const summary = await asUser(t, userId).query(api.features.devices.queries.listMine, {})
    expect(summary[0]?.status).toBe("revoked")
  })

  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_mine" })

    await expectRejected(
      t.mutation(api.features.devices.mutations.revoke, { deviceId: "dev_mine" }),
      "NOT_AUTHORIZED",
    )
  })

  test("cannot revoke another user's device", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await insertDevice(t, theirs, { deviceId: "dev_theirs", status: "online" })

    await expectRejected(
      asUser(t, mine).mutation(api.features.devices.mutations.revoke, { deviceId: "dev_theirs" }),
      "NOT_AUTHORIZED",
    )

    const record = await t.query(api.service.devices.getRecord, {
      serviceToken: SERVICE_TOKEN,
      deviceId: "dev_theirs",
    })
    expect(record?.status).toBe("online")
  })
})

describe("device presence decays", () => {
  test("a device left online by a dead gateway reads offline once its claim is stale", async () => {
    // The relay writes "online" on hello and only unwrites it in its disconnect
    // handler — which never runs when the process is killed, and it is killed on
    // every deploy. Without a TTL the row stays "online" forever, the dashboard
    // shows a phantom, and selectDevice routes a job to a device with no socket.
    const t = setupConvex()
    const user = await createUser(t)
    await insertDevice(t, user, {
      deviceId: "dev_stale",
      status: "online",
      lastSeenAt: Date.now() - PRESENCE_TTL_MS - 1_000,
    })

    const record = await t.query(api.service.devices.getRecord, {
      serviceToken: SERVICE_TOKEN,
      deviceId: "dev_stale",
    })
    expect(record?.status).toBe("offline")

    const [summary] = await asUser(t, user).query(api.features.devices.queries.listMine, {})
    expect(summary?.status).toBe("offline")
  })

  test("a revoked device stays revoked however stale it is", async () => {
    const t = setupConvex()
    const user = await createUser(t)
    await insertDevice(t, user, {
      deviceId: "dev_revoked",
      status: "revoked",
      lastSeenAt: Date.now() - PRESENCE_TTL_MS - 1_000,
    })

    const [summary] = await asUser(t, user).query(api.features.devices.queries.listMine, {})
    expect(summary?.status).toBe("revoked")
  })
})

describe("features/devices/mutations:rename", () => {
  test("renames the caller's own device without changing identity", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_mine" })

    await asUser(t, userId).mutation(api.features.devices.mutations.rename, {
      deviceId: "dev_mine",
      displayName: "  Render node  ",
    })

    const devices = await asUser(t, userId).query(api.features.devices.queries.listMine, {})
    expect(devices[0]?.displayName).toBe("Render node")
    expect(devices[0]?.deviceId).toBe("dev_mine")
  })

  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_mine" })

    await expectRejected(
      t.mutation(api.features.devices.mutations.rename, {
        deviceId: "dev_mine",
        displayName: "Render node",
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("cannot rename another user's device", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await insertDevice(t, theirs, { deviceId: "dev_theirs" })

    await expectRejected(
      asUser(t, mine).mutation(api.features.devices.mutations.rename, {
        deviceId: "dev_theirs",
        displayName: "Taken over",
      }),
      "NOT_AUTHORIZED",
    )

    const devices = await asUser(t, theirs).query(api.features.devices.queries.listMine, {})
    expect(devices[0]?.displayName).toBe("Studio laptop")
  })

  test("rejects an empty or over-long display name", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_mine" })

    await expectRejected(
      asUser(t, userId).mutation(api.features.devices.mutations.rename, {
        deviceId: "dev_mine",
        displayName: "   ",
      }),
      "INVALID_INPUT",
    )
    await expectRejected(
      asUser(t, userId).mutation(api.features.devices.mutations.rename, {
        deviceId: "dev_mine",
        displayName: "x".repeat(65),
      }),
      "INVALID_INPUT",
    )
  })
})

describe("features/devices/mutations:forget", () => {
  test("permanently removes only a revoked owned device, its relay route, and retains an audit record", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_revoked_forget", status: "revoked" })
    await t.run(async (ctx) => {
      await ctx.db.insert("relayRoutes", {
        deviceId: "dev_revoked_forget",
        gatewayId: "gw_0123456789abcdef",
        sessionId: "nce_0123456789abcdef",
        internalUrl: "http://10.0.0.2:8787",
        updatedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      })
    })

    await asUser(t, userId).mutation(api.features.devices.mutations.forget, {
      deviceId: "dev_revoked_forget",
    })

    const devices = await asUser(t, userId).query(api.features.devices.queries.listMine, {})
    expect(devices).toHaveLength(0)

    const record = await t.query(api.service.devices.getRecord, {
      serviceToken: SERVICE_TOKEN,
      deviceId: "dev_revoked_forget",
    })
    expect(record).toBeNull()

    const routes = await t.run(async (ctx) =>
      await ctx.db
        .query("relayRoutes")
        .withIndex("by_device", (q) => q.eq("deviceId", "dev_revoked_forget"))
        .collect(),
    )
    expect(routes).toHaveLength(0)

    const audit = await asUser(t, userId).query(api.features.audit.queries.listMine, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(audit.page).toHaveLength(1)
    expect(audit.page[0]).toMatchObject({
      userId,
      connectorId: "system.devices",
      actionId: "device.forget",
      executorKind: "none",
      deviceId: "dev_revoked_forget",
      policyDecision: "ALLOW",
      status: "success",
    })
  })

  test("refuses to forget an online or offline device before explicit revocation", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_online_keep", status: "online" })
    await insertDevice(t, userId, { deviceId: "dev_offline_keep", status: "offline" })

    for (const deviceId of ["dev_online_keep", "dev_offline_keep"]) {
      await expectRejected(
        asUser(t, userId).mutation(api.features.devices.mutations.forget, { deviceId }),
        "INVALID_INPUT",
      )
    }

    const devices = await asUser(t, userId).query(api.features.devices.queries.listMine, {})
    expect(devices.map((device) => device.deviceId).sort()).toEqual(["dev_offline_keep", "dev_online_keep"])
  })

  test("cannot forget another user's revoked device", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await insertDevice(t, theirs, { deviceId: "dev_theirs_revoked", status: "revoked" })

    await expectRejected(
      asUser(t, mine).mutation(api.features.devices.mutations.forget, { deviceId: "dev_theirs_revoked" }),
      "NOT_AUTHORIZED",
    )

    const theirsDevices = await asUser(t, theirs).query(api.features.devices.queries.listMine, {})
    expect(theirsDevices).toHaveLength(1)
  })

  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_revoked_auth", status: "revoked" })

    await expectRejected(
      t.mutation(api.features.devices.mutations.forget, { deviceId: "dev_revoked_auth" }),
      "NOT_AUTHORIZED",
    )
  })

  test("fails closed instead of partially deleting inconsistent duplicate relay routes", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await insertDevice(t, userId, { deviceId: "dev_route_conflict", status: "revoked" })
    await t.run(async (ctx) => {
      for (const suffix of ["a", "b"]) {
        await ctx.db.insert("relayRoutes", {
          deviceId: "dev_route_conflict",
          gatewayId: `gw_0123456789abcde${suffix}`,
          sessionId: `nce_0123456789abcde${suffix}`,
          internalUrl: "http://10.0.0.2:8787",
          updatedAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        })
      }
    })

    await expectRejected(
      asUser(t, userId).mutation(api.features.devices.mutations.forget, { deviceId: "dev_route_conflict" }),
      "INTERNAL",
    )

    const devices = await asUser(t, userId).query(api.features.devices.queries.listMine, {})
    expect(devices).toHaveLength(1)
  })
})
