import { describe, expect, test } from "vitest"
import type { Doc } from "../_generated/dataModel"
import { internal } from "../_generated/api"
import { APPROVAL_SWEEP_BATCH } from "../_shared/limits"
import { setupConvex, type TestClient } from "../test.helpers"

type ApprovalStatus = Doc<"approvals">["status"]

async function seed(
  t: TestClient,
  requestHash: string,
  expiresAt: number,
  status: ApprovalStatus = "pending",
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("approvals", {
      ownerId: "user_approval_sweep",
      connectorId: "careerpack",
      actionId: "applications.delete",
      requestHash,
      inputPreview: "{}",
      risk: "R3",
      status,
      requestedAt: expiresAt - 1_000,
      expiresAt,
      ...(status === "pending" ? {} : { resolvedAt: expiresAt - 500 }),
    })
  })
}

const sweep = (t: TestClient) => t.mutation(internal.maintenance.oauth_sweep.sweep, {})
const approvals = (t: TestClient) => t.run(async (ctx) => ctx.db.query("approvals").take(500))

describe("approval maintenance", () => {
  test("deletes every expired status and leaves a live row", async () => {
    const t = setupConvex()
    const past = Date.now() - 1
    for (const status of ["pending", "approved", "denied", "consumed"] as const) {
      await seed(t, `expired-${status}`, past, status)
    }
    await seed(t, "live", Date.now() + 60_000)

    expect(await sweep(t)).toMatchObject({ approvals: 4 })
    expect((await approvals(t)).map((row) => row.requestHash)).toEqual(["live"])
  })

  test("is bounded and finishes the remainder on the next pass", async () => {
    const t = setupConvex()
    const past = Date.now() - 1
    for (let i = 0; i < APPROVAL_SWEEP_BATCH + 5; i += 1) {
      await seed(t, `expired-${i}`, past)
    }

    expect((await sweep(t)).approvals).toBe(APPROVAL_SWEEP_BATCH)
    expect(await approvals(t)).toHaveLength(5)
    expect((await sweep(t)).approvals).toBe(5)
    expect(await approvals(t)).toHaveLength(0)
  })

  test("does not touch another table", async () => {
    const t = setupConvex()
    await seed(t, "expired", Date.now() - 1)
    await t.run(async (ctx) => {
      await ctx.db.insert("apiKeys", {
        keyId: "key_untouched",
        userId: "user_approval_sweep",
        scopes: [],
        secretHash: "pbkdf2$sha256$210000$c2FsdA$aGFzaA",
        status: "active",
        label: "untouched",
      })
    })

    await sweep(t)

    const keys = await t.run(async (ctx) => ctx.db.query("apiKeys").take(10))
    expect(keys).toHaveLength(1)
  })
})
