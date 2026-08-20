import { describe, expect, test, vi } from "vitest"
import { api } from "../_generated/api"
import { expectRejected, setupConvex, SERVICE_TOKEN, WRONG_SERVICE_TOKEN } from "../test.helpers"

const KEY = "a".repeat(64)

describe("service/rate_limits", () => {
  test("shares one transactional fixed window", async () => {
    const t = setupConvex()
    const args = { serviceToken: SERVICE_TOKEN, bucket: "edge", keyDigest: KEY, limit: 2, windowMs: 60_000 }
    expect((await t.mutation(api.service.rate_limits.consume, args)).allowed).toBe(true)
    expect((await t.mutation(api.service.rate_limits.consume, args)).allowed).toBe(true)
    expect((await t.mutation(api.service.rate_limits.consume, args)).allowed).toBe(false)
    const rows = await t.run(async (ctx) => ctx.db.query("rateLimitBuckets").take(10))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ bucket: "edge", keyDigest: KEY, count: 2 })
  })

  test("expired windows reset instead of growing rows", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-08-20T00:00:00Z"))
      const t = setupConvex()
      const args = { serviceToken: SERVICE_TOKEN, bucket: "oauth", keyDigest: KEY, limit: 1, windowMs: 1000 }
      expect((await t.mutation(api.service.rate_limits.consume, args)).allowed).toBe(true)
      expect((await t.mutation(api.service.rate_limits.consume, args)).allowed).toBe(false)
      vi.advanceTimersByTime(1001)
      expect((await t.mutation(api.service.rate_limits.consume, args)).allowed).toBe(true)
      expect(await t.run(async (ctx) => ctx.db.query("rateLimitBuckets").take(10))).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  test("requires service auth and bounded bucket inputs", async () => {
    const t = setupConvex()
    await expectRejected(t.mutation(api.service.rate_limits.consume, {
      serviceToken: WRONG_SERVICE_TOKEN, bucket: "edge", keyDigest: KEY, limit: 1, windowMs: 1000,
    }), "NOT_AUTHORIZED")
    await expectRejected(t.mutation(api.service.rate_limits.consume, {
      serviceToken: SERVICE_TOKEN, bucket: "../../edge", keyDigest: KEY, limit: 1, windowMs: 1000,
    }), "INVALID_INPUT")
    await expectRejected(t.mutation(api.service.rate_limits.consume, {
      serviceToken: SERVICE_TOKEN, bucket: "edge", keyDigest: "not-a-digest", limit: 1, windowMs: 1000,
    }), "INVALID_INPUT")
  })
})
