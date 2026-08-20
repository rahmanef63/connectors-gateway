import { describe, expect, test } from "vitest"
import { api } from "../_generated/api"
import {
  APPROVAL_TTL_MS,
  MAX_INPUT_PREVIEW_LENGTH,
  MAX_PENDING_APPROVALS_PER_OWNER,
} from "../_shared/limits"
import {
  createUser,
  expectRejected,
  setupConvex,
  SERVICE_TOKEN,
  WRONG_SERVICE_TOKEN,
  type TestClient,
} from "../test.helpers"

const CONNECTOR = "careerpack"
const ACTION = "applications.delete"

function request(
  t: TestClient,
  ownerId: string,
  requestHash: string,
  overrides: Partial<{ connectorId: string; actionId: string; inputPreview: string; risk: string }> = {},
) {
  return t.mutation(api.service.approvals.request, {
    serviceToken: SERVICE_TOKEN,
    ownerId,
    connectorId: overrides.connectorId ?? CONNECTOR,
    actionId: overrides.actionId ?? ACTION,
    requestHash,
    inputPreview: overrides.inputPreview ?? '{"applicationId":"app_1"}',
    risk: overrides.risk ?? "R3",
  })
}

const rows = (t: TestClient) => t.run(async (ctx) => ctx.db.query("approvals").take(500))

describe("service/approvals:request", () => {
  test("creates one short-lived pending row and truncates the model-written preview", async () => {
    const t = setupConvex()
    const ownerId = await createUser(t)
    const before = Date.now()

    await request(t, ownerId, "hash-create", { inputPreview: "x".repeat(500) })

    const [row] = await rows(t)
    expect(row).toMatchObject({
      ownerId,
      connectorId: CONNECTOR,
      actionId: ACTION,
      requestHash: "hash-create",
      risk: "R3",
      status: "pending",
    })
    expect(row?.inputPreview).toHaveLength(MAX_INPUT_PREVIEW_LENGTH)
    expect(row?.expiresAt).toBeGreaterThanOrEqual(before + APPROVAL_TTL_MS)
  })

  test("is idempotent for the same live request hash", async () => {
    const t = setupConvex()
    const ownerId = await createUser(t)
    await request(t, ownerId, "hash-same")
    const first = (await rows(t))[0]
    await request(t, ownerId, "hash-same")

    const all = await rows(t)
    expect(all).toHaveLength(1)
    expect(all[0]?._id).toBe(first?._id)
    expect(all[0]?.requestedAt).toBe(first?.requestedAt)
  })

  test("does not revive an unexpired denial", async () => {
    const t = setupConvex()
    const ownerId = await createUser(t)
    await request(t, ownerId, "hash-denied")
    const [created] = await rows(t)
    if (created === undefined) throw new Error("fixture approval missing")
    await t.run(async (ctx) => ctx.db.patch(created._id, { status: "denied", resolvedAt: Date.now() }))

    await request(t, ownerId, "hash-denied")

    const [after] = await rows(t)
    expect(after?.status).toBe("denied")
    expect(after?.requestedAt).toBe(created.requestedAt)
  })

  test("refreshes an expired row back to pending", async () => {
    const t = setupConvex()
    const ownerId = await createUser(t)
    await request(t, ownerId, "hash-expired")
    const [created] = await rows(t)
    if (created === undefined) throw new Error("fixture approval missing")
    await t.run(async (ctx) =>
      ctx.db.patch(created._id, {
        status: "denied",
        expiresAt: Date.now() - 1,
        resolvedAt: Date.now() - 10,
      }),
    )

    await request(t, ownerId, "hash-expired")

    const [after] = await rows(t)
    expect(after?.status).toBe("pending")
    expect(after?.expiresAt).toBeGreaterThan(Date.now())
    expect(after?.resolvedAt).toBeUndefined()
  })

  test("enforces the queue cap before inserting the next distinct request", async () => {
    const t = setupConvex()
    const ownerId = await createUser(t)
    for (let i = 0; i < MAX_PENDING_APPROVALS_PER_OWNER; i += 1) {
      await request(t, ownerId, `hash-${i}`)
    }

    await request(t, ownerId, "hash-overflow")

    const all = await rows(t)
    expect(all).toHaveLength(MAX_PENDING_APPROVALS_PER_OWNER)
    expect(all.some((row) => row.requestHash === "hash-overflow")).toBe(true)
    expect(all.filter((row) => /^hash-\d+$/.test(row.requestHash)).length).toBe(
      MAX_PENDING_APPROVALS_PER_OWNER - 1,
    )
  })

  test("rejects a wrong service token and writes nothing", async () => {
    const t = setupConvex()
    const ownerId = await createUser(t)
    await expectRejected(
      t.mutation(api.service.approvals.request, {
        serviceToken: WRONG_SERVICE_TOKEN,
        ownerId,
        connectorId: CONNECTOR,
        actionId: ACTION,
        requestHash: "hash-wrong-token",
        inputPreview: "{}",
        risk: "R3",
      }),
      "NOT_AUTHORIZED",
    )
    expect(await rows(t)).toEqual([])
  })
})

describe("service/approvals:claim", () => {
  test("spends an approved row exactly once", async () => {
    const t = setupConvex()
    const ownerId = await createUser(t)
    await request(t, ownerId, "hash-once")
    const [created] = await rows(t)
    if (created === undefined) throw new Error("fixture approval missing")
    await t.run(async (ctx) => ctx.db.patch(created._id, { status: "approved", resolvedAt: Date.now() }))

    const first = await t.mutation(api.service.approvals.claim, {
      serviceToken: SERVICE_TOKEN,
      ownerId,
      requestHash: "hash-once",
    })
    const second = await t.mutation(api.service.approvals.claim, {
      serviceToken: SERVICE_TOKEN,
      ownerId,
      requestHash: "hash-once",
    })

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect((await rows(t))[0]?.status).toBe("consumed")
  })

  test("never crosses owner or request-hash boundaries", async () => {
    const t = setupConvex()
    const ownerId = await createUser(t)
    const other = await createUser(t)
    await request(t, ownerId, "hash-exact")
    const [created] = await rows(t)
    if (created === undefined) throw new Error("fixture approval missing")
    await t.run(async (ctx) => ctx.db.patch(created._id, { status: "approved" }))

    expect(
      await t.mutation(api.service.approvals.claim, {
        serviceToken: SERVICE_TOKEN,
        ownerId: other,
        requestHash: "hash-exact",
      }),
    ).toBe(false)
    expect(
      await t.mutation(api.service.approvals.claim, {
        serviceToken: SERVICE_TOKEN,
        ownerId,
        requestHash: "hash-different",
      }),
    ).toBe(false)
    expect((await rows(t))[0]?.status).toBe("approved")
  })

  test("an expired approval cannot be spent", async () => {
    const t = setupConvex()
    const ownerId = await createUser(t)
    await request(t, ownerId, "hash-lapsed")
    const [created] = await rows(t)
    if (created === undefined) throw new Error("fixture approval missing")
    await t.run(async (ctx) =>
      ctx.db.patch(created._id, { status: "approved", expiresAt: Date.now() - 1 }),
    )

    expect(
      await t.mutation(api.service.approvals.claim, {
        serviceToken: SERVICE_TOKEN,
        ownerId,
        requestHash: "hash-lapsed",
      }),
    ).toBe(false)
    expect((await rows(t))[0]?.status).toBe("approved")
  })
})
