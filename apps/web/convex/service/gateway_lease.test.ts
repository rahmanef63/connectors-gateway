import { describe, expect, test } from "vitest"
import { GATEWAY_LEASE_NAME } from "@cg/core"
import { api } from "../_generated/api"
import {
  expectRejected,
  setupConvex,
  SERVICE_TOKEN,
  WRONG_SERVICE_TOKEN,
} from "../test.helpers"

const ONE = "gw_1111111111111111"
const TWO = "gw_2222222222222222"

function acquire(t: ReturnType<typeof setupConvex>, holderId: string) {
  return t.mutation(api.service.gateway_lease.acquire, {
    serviceToken: SERVICE_TOKEN,
    holderId,
  })
}

function renew(t: ReturnType<typeof setupConvex>, holderId: string) {
  return t.mutation(api.service.gateway_lease.renew, {
    serviceToken: SERVICE_TOKEN,
    holderId,
  })
}

describe("service/gateway_lease", () => {
  test("creates one lease and refuses another live holder", async () => {
    const t = setupConvex()
    const first = await acquire(t, ONE)
    const second = await acquire(t, TWO)

    expect(first.acquired).toBe(true)
    expect(first.expiresAt).toBeGreaterThan(Date.now())
    expect(second).toEqual({ acquired: false, expiresAt: first.expiresAt })

    const rows = await t.run(async (ctx) => ctx.db.query("gatewayLeases").take(10))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ leaseName: GATEWAY_LEASE_NAME, holderId: ONE })
  })

  test("the same startup holder may idempotently extend its lease", async () => {
    const t = setupConvex()
    const first = await acquire(t, ONE)
    const second = await acquire(t, ONE)

    expect(second.acquired).toBe(true)
    expect(second.expiresAt).toBeGreaterThanOrEqual(first.expiresAt)
    const rows = await t.run(async (ctx) => ctx.db.query("gatewayLeases").take(10))
    expect(rows).toHaveLength(1)
  })

  test("an expired holder can be replaced atomically", async () => {
    const t = setupConvex()
    await t.run(async (ctx) => {
      await ctx.db.insert("gatewayLeases", {
        leaseName: GATEWAY_LEASE_NAME,
        holderId: ONE,
        acquiredAt: Date.now() - 60_000,
        renewedAt: Date.now() - 60_000,
        expiresAt: Date.now() - 1,
      })
    })

    expect((await acquire(t, TWO)).acquired).toBe(true)
    const row = await t.run(async (ctx) => ctx.db.query("gatewayLeases").first())
    expect(row?.holderId).toBe(TWO)
    expect(row?.expiresAt).toBeGreaterThan(Date.now())
  })

  test("renew is holder-bound and never revives an expired lease", async () => {
    const t = setupConvex()
    await acquire(t, ONE)
    expect((await renew(t, TWO)).renewed).toBe(false)
    expect((await renew(t, ONE)).renewed).toBe(true)

    await t.run(async (ctx) => {
      const row = await ctx.db.query("gatewayLeases").first()
      if (row === null) throw new Error("lease fixture missing")
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 })
    })
    expect((await renew(t, ONE)).renewed).toBe(false)
  })

  test("release deletes only the matching holder", async () => {
    const t = setupConvex()
    await acquire(t, ONE)
    expect(
      await t.mutation(api.service.gateway_lease.release, {
        serviceToken: SERVICE_TOKEN,
        holderId: TWO,
      }),
    ).toEqual({ released: false })
    expect(
      await t.mutation(api.service.gateway_lease.release, {
        serviceToken: SERVICE_TOKEN,
        holderId: ONE,
      }),
    ).toEqual({ released: true })
    expect(await t.run(async (ctx) => ctx.db.query("gatewayLeases").first())).toBeNull()
  })

  test("requires the service token and a bounded opaque holder id", async () => {
    const t = setupConvex()
    await expectRejected(
      t.mutation(api.service.gateway_lease.acquire, {
        serviceToken: WRONG_SERVICE_TOKEN,
        holderId: ONE,
      }),
      "NOT_AUTHORIZED",
    )
    await expectRejected(
      t.mutation(api.service.gateway_lease.acquire, {
        serviceToken: SERVICE_TOKEN,
        holderId: "../../another-process",
      }),
      "INVALID_INPUT",
    )
  })
})
