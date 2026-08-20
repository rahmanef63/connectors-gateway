import { describe, expect, test } from "vitest"
import type { Doc, Id } from "../../_generated/dataModel"
import { api } from "../../_generated/api"
import {
  asUser,
  createUser,
  expectRejected,
  setupConvex,
  type TestClient,
} from "../../test.helpers"

type ApprovalStatus = Doc<"approvals">["status"]

async function seed(
  t: TestClient,
  ownerId: string,
  overrides: Partial<{
    connectorId: string
    actionId: string
    requestHash: string
    inputPreview: string
    risk: string
    status: ApprovalStatus
    requestedAt: number
    expiresAt: number
    resolvedAt: number
  }> = {},
): Promise<Id<"approvals">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("approvals", {
      ownerId,
      connectorId: overrides.connectorId ?? "careerpack",
      actionId: overrides.actionId ?? "applications.delete",
      requestHash: overrides.requestHash ?? "hash-default",
      inputPreview: overrides.inputPreview ?? '{"applicationId":"app_1"}',
      risk: overrides.risk ?? "R3",
      status: overrides.status ?? "pending",
      requestedAt: overrides.requestedAt ?? Date.now(),
      expiresAt: overrides.expiresAt ?? Date.now() + 60_000,
      ...(overrides.resolvedAt === undefined ? {} : { resolvedAt: overrides.resolvedAt }),
    }),
  )
}

describe("features/approvals/queries:listPending", () => {
  test("returns only the caller's live pending rows, newest first, without internal keys", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    const now = Date.now()
    await seed(t, mine, { actionId: "first", requestHash: "h1", requestedAt: 100, expiresAt: now + 60_000 })
    await seed(t, mine, { actionId: "second", requestHash: "h2", requestedAt: 200, expiresAt: now + 60_000 })
    await seed(t, mine, { actionId: "expired", requestHash: "h3", requestedAt: 300, expiresAt: now - 1 })
    await seed(t, mine, { actionId: "approved", requestHash: "h4", status: "approved" })
    await seed(t, theirs, { actionId: "theirs", requestHash: "h5" })

    const result = await asUser(t, mine).query(api.features.approvals.queries.listPending, {})

    expect(result.map((row) => row.actionId)).toEqual(["second", "first"])
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("requestHash")
    expect(serialized).not.toContain(String(mine))
    expect(serialized).not.toContain(String(theirs))
  })

  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    await expectRejected(t.query(api.features.approvals.queries.listPending, {}), "NOT_AUTHORIZED")
  })
})

describe("features/approvals/mutations", () => {
  test("approves or denies the signed-in user's own pending row without executing it", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const approveId = await seed(t, userId, { requestHash: "approve" })
    const denyId = await seed(t, userId, { requestHash: "deny" })

    expect(
      await asUser(t, userId).mutation(api.features.approvals.mutations.approve, {
        approvalId: approveId,
      }),
    ).toBeNull()
    expect(
      await asUser(t, userId).mutation(api.features.approvals.mutations.deny, {
        approvalId: denyId,
      }),
    ).toBeNull()

    const rows = await t.run(async (ctx) => ctx.db.query("approvals").take(10))
    expect(rows.find((row) => row._id === approveId)?.status).toBe("approved")
    expect(rows.find((row) => row._id === denyId)?.status).toBe("denied")
    expect(await asUser(t, userId).query(api.features.approvals.queries.listPending, {})).toEqual([])
  })

  test("cannot resolve another user's row and does not reveal that it exists", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    const approvalId = await seed(t, theirs)

    await expect(
      asUser(t, mine).mutation(api.features.approvals.mutations.approve, { approvalId }),
    ).rejects.toThrow("Approval tidak ditemukan.")
    const row = await t.run(async (ctx) => ctx.db.get(approvalId))
    expect(row?.status).toBe("pending")
  })

  test("rejects an anonymous caller, an answered row, and an expired row", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const answered = await seed(t, userId, { status: "denied" })
    const expired = await seed(t, userId, { requestHash: "expired", expiresAt: Date.now() - 1 })

    await expectRejected(
      t.mutation(api.features.approvals.mutations.approve, { approvalId: answered }),
      "NOT_AUTHORIZED",
    )
    await expect(
      asUser(t, userId).mutation(api.features.approvals.mutations.approve, { approvalId: answered }),
    ).rejects.toThrow("Approval sudah dijawab.")
    await expect(
      asUser(t, userId).mutation(api.features.approvals.mutations.approve, { approvalId: expired }),
    ).rejects.toThrow("Approval sudah kedaluwarsa.")
  })
})
