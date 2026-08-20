import { describe, expect, test } from "vitest"
import { api } from "../_generated/api"
import { insertDevice, setupConvex, SERVICE_TOKEN } from "../test.helpers"

const GW1 = "gw_1111111111111111"
const GW2 = "gw_2222222222222222"
const S1 = "nce_1111111111111111"
const S2 = "nce_2222222222222222"
const DEV = "dev_route_fixture"

async function seed() {
  const t = setupConvex()
  await insertDevice(t, "user_1", { deviceId: DEV, status: "online" })
  return t
}

describe("service/relay_routes", () => {
  test("a reconnect atomically replaces the previous owner", async () => {
    const t = await seed()
    expect((await t.mutation(api.service.relay_routes.claim, { serviceToken: SERVICE_TOKEN, deviceId: DEV, gatewayId: GW1, sessionId: S1, internalUrl: "http://10.0.0.2:8787" })).ok).toBe(true)
    expect((await t.mutation(api.service.relay_routes.claim, { serviceToken: SERVICE_TOKEN, deviceId: DEV, gatewayId: GW2, sessionId: S2, internalUrl: "http://10.0.0.3:8787" })).ok).toBe(true)
    expect(await t.query(api.service.relay_routes.resolve, { serviceToken: SERVICE_TOKEN, deviceId: DEV })).toMatchObject({ gatewayId: GW2, sessionId: S2 })
    expect((await t.mutation(api.service.relay_routes.refresh, { serviceToken: SERVICE_TOKEN, deviceId: DEV, gatewayId: GW1, sessionId: S1 })).ok).toBe(false)
  })

  test("release is session-bound so a stale close cannot remove a replacement", async () => {
    const t = await seed()
    await t.mutation(api.service.relay_routes.claim, { serviceToken: SERVICE_TOKEN, deviceId: DEV, gatewayId: GW1, sessionId: S1, internalUrl: "http://10.0.0.2:8787" })
    await t.mutation(api.service.relay_routes.claim, { serviceToken: SERVICE_TOKEN, deviceId: DEV, gatewayId: GW2, sessionId: S2, internalUrl: "http://10.0.0.3:8787" })
    expect((await t.mutation(api.service.relay_routes.release, { serviceToken: SERVICE_TOKEN, deviceId: DEV, gatewayId: GW1, sessionId: S1 })).ok).toBe(false)
    expect(await t.query(api.service.relay_routes.resolve, { serviceToken: SERVICE_TOKEN, deviceId: DEV })).toMatchObject({ gatewayId: GW2 })
  })

  test("revoked devices and non-private peer endpoints fail closed", async () => {
    const t = await seed()
    await t.run(async (ctx) => {
      const row = await ctx.db.query("devices").first()
      if (row) await ctx.db.patch(row._id, { status: "revoked" })
    })
    expect((await t.mutation(api.service.relay_routes.claim, { serviceToken: SERVICE_TOKEN, deviceId: DEV, gatewayId: GW1, sessionId: S1, internalUrl: "http://10.0.0.2:8787" })).ok).toBe(false)

    const fresh = await seed()
    await expect(fresh.mutation(api.service.relay_routes.claim, { serviceToken: SERVICE_TOKEN, deviceId: DEV, gatewayId: GW1, sessionId: S1, internalUrl: "http://8.8.8.8:8787" })).rejects.toThrow()
  })
})
