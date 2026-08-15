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
