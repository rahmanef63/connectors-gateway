import { describe, expect, test } from "vitest"
import { api } from "../../_generated/api"
import {
  asUser,
  createUser,
  expectRejected,
  setupConvex,
  type TestClient,
} from "../../test.helpers"

async function seedAudit(t: TestClient, userId: string, count: number, prefix = "req"): Promise<void> {
  await t.run(async (ctx) => {
    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("auditLogs", {
        requestId: `${prefix}_${index}`,
        timestamp: 1_700_000_000_000 + index,
        actorId: "key_abc",
        userId,
        connectorId: "blender",
        actionId: "scene.render",
        executorKind: "local",
        policyDecision: "ALLOW",
        status: "success",
        latencyMs: 10 + index,
      })
    }
  })
}

describe("features/audit/queries:listMine", () => {
  test("paginates newest first and stays inside one page", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await seedAudit(t, userId, 7)

    const first = await asUser(t, userId).query(api.features.audit.queries.listMine, {
      paginationOpts: { numItems: 3, cursor: null },
    })

    expect(first.page).toHaveLength(3)
    expect(first.isDone).toBe(false)
    expect(first.page[0]?.requestId).toBe("req_6")

    const second = await asUser(t, userId).query(api.features.audit.queries.listMine, {
      paginationOpts: { numItems: 3, cursor: first.continueCursor },
    })
    expect(second.page.map((row) => row.requestId)).toEqual(["req_3", "req_2", "req_1"])
  })

  test("is scoped to the caller", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await seedAudit(t, mine, 2, "mine")
    await seedAudit(t, theirs, 5, "theirs")

    const page = await asUser(t, mine).query(api.features.audit.queries.listMine, {
      paginationOpts: { numItems: 50, cursor: null },
    })

    expect(page.page).toHaveLength(2)
    expect(page.page.every((row) => row.userId === mine)).toBe(true)
    expect(JSON.stringify(page.page)).not.toContain("theirs_")
  })

  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await seedAudit(t, userId, 1)

    await expectRejected(
      t.query(api.features.audit.queries.listMine, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("clamps an absurd page size instead of trusting it", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await seedAudit(t, userId, 4)

    const page = await asUser(t, userId).query(api.features.audit.queries.listMine, {
      paginationOpts: { numItems: 100_000, cursor: null },
    })

    expect(page.page).toHaveLength(4)
    expect(page.isDone).toBe(true)
  })
})
