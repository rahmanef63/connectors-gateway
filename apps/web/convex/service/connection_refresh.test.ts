import { describe, expect, test } from "vitest"
import { api } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import {
  createUser,
  expectRejected,
  setupConvex,
  SERVICE_TOKEN,
  WRONG_SERVICE_TOKEN,
  type TestClient,
} from "../test.helpers"

const TOKEN = `v1.${"A".repeat(16)}.${"B".repeat(24)}`
const TOKEN_TWO = `v1.${"C".repeat(16)}.${"D".repeat(32)}`
const RENEWAL = `v1.${"E".repeat(16)}.${"F".repeat(40)}`
const RENEWAL_TWO = `v1.${"G".repeat(16)}.${"H".repeat(48)}`
const LEASE = "lease_1234567890abcdef"

async function seed(
  t: TestClient,
  ownerId: string,
  overrides: Partial<{
    connectorId: string
    tokenExpiresAt: number
    renewalCipher: string
    credentialVersion: number
    status: "active" | "expired" | "revoked" | "error"
  }> = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("connections", {
      connectorId: overrides.connectorId ?? "careerpack",
      ownerType: "user",
      ownerId,
      authType: "bearer",
      status: overrides.status ?? "active",
      baseUrl: "https://api.example.test/mcp",
      tokenCipher: TOKEN,
      credentialVersion: overrides.credentialVersion ?? 1,
      ...(overrides.tokenExpiresAt === undefined
        ? {}
        : { tokenExpiresAt: overrides.tokenExpiresAt }),
      ...(overrides.renewalCipher === undefined
        ? {}
        : { renewalCipher: overrides.renewalCipher }),
    }),
  )
}

function begin(
  t: TestClient,
  args: { userId: string; connectionId: string; leaseId?: string; connectorId?: string },
) {
  return t.mutation(api.service.connections.beginRefresh, {
    serviceToken: SERVICE_TOKEN,
    userId: args.userId,
    connectorId: args.connectorId ?? "careerpack",
    connectionId: args.connectionId,
    leaseId: args.leaseId ?? LEASE,
  })
}

async function row(t: TestClient, connectionId: Id<"connections">) {
  return await t.run(async (ctx) => ctx.db.get(connectionId))
}

describe("service/connections refresh lease", () => {
  test("returns a fresh credential without acquiring a lease", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const connectionId = await seed(t, userId, {
      tokenExpiresAt: Date.now() + 10 * 60_000,
      renewalCipher: RENEWAL,
    })

    const result = await begin(t, { userId, connectionId })

    expect(result).toMatchObject({
      state: "ready",
      credential: { connectionId, credentialVersion: 1, tokenCipher: TOKEN },
    })
    expect((await row(t, connectionId))?.refreshLeaseId).toBeUndefined()
  })

  test("leases one expiring renewable credential and makes a second gateway wait", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const connectionId = await seed(t, userId, {
      tokenExpiresAt: Date.now() + 10_000,
      renewalCipher: RENEWAL,
    })

    const first = await begin(t, { userId, connectionId })
    const second = await begin(t, {
      userId,
      connectionId,
      leaseId: "lease_abcdef1234567890",
    })

    expect(first).toMatchObject({
      state: "refresh",
      credential: { connectionId, renewalCipher: RENEWAL, credentialVersion: 1 },
    })
    expect(second.state).toBe("wait")
    if (second.state === "wait") expect(second.retryAfterMs).toBeGreaterThan(0)
    expect((await row(t, connectionId))?.refreshLeaseId).toBe(LEASE)
  })

  test("uses the remaining lifetime when no renewal exists, then expires the row", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const stillLive = await seed(t, userId, { tokenExpiresAt: Date.now() + 10_000 })
    const lapsed = await seed(t, userId, {
      connectorId: "mso",
      tokenExpiresAt: Date.now() - 1,
    })

    expect((await begin(t, { userId, connectionId: stillLive })).state).toBe("ready")
    expect(
      (
        await begin(t, {
          userId,
          connectionId: lapsed,
          connectorId: "mso",
          leaseId: "lease_mso1234567890",
        })
      ).state,
    ).toBe("missing")
    expect((await row(t, lapsed))?.status).toBe("expired")
  })

  test("never leases a connection owned by another user", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    const connectionId = await seed(t, theirs, {
      tokenExpiresAt: Date.now() - 1,
      renewalCipher: RENEWAL,
    })

    expect((await begin(t, { userId: mine, connectionId })).state).toBe("missing")
    expect((await row(t, connectionId))?.refreshLeaseId).toBeUndefined()
  })

  test("rejects a wrong service token before reading the credential", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const connectionId = await seed(t, userId, {
      tokenExpiresAt: Date.now() - 1,
      renewalCipher: RENEWAL,
    })
    await expectRejected(
      t.mutation(api.service.connections.beginRefresh, {
        serviceToken: WRONG_SERVICE_TOKEN,
        userId,
        connectorId: "careerpack",
        connectionId,
        leaseId: LEASE,
      }),
      "NOT_AUTHORIZED",
    )
    expect((await row(t, connectionId))?.refreshLeaseId).toBeUndefined()
  })
})

describe("service/connections refresh completion", () => {
  test("atomically rotates both sealed documents and increments the generation", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const connectionId = await seed(t, userId, {
      tokenExpiresAt: Date.now() - 1,
      renewalCipher: RENEWAL,
    })
    expect((await begin(t, { userId, connectionId })).state).toBe("refresh")
    const expiresAt = Date.now() + 3_600_000

    const result = await t.mutation(api.service.connections.finishRefresh, {
      serviceToken: SERVICE_TOKEN,
      userId,
      connectorId: "careerpack",
      connectionId,
      expectedVersion: 1,
      leaseId: LEASE,
      tokenCipher: TOKEN_TWO,
      tokenExpiresAt: expiresAt,
      renewalCipher: RENEWAL_TWO,
    })

    expect(result).toEqual({ updated: true })
    expect(await row(t, connectionId)).toMatchObject({
      status: "active",
      tokenCipher: TOKEN_TWO,
      tokenExpiresAt: expiresAt,
      renewalCipher: RENEWAL_TWO,
      credentialVersion: 2,
    })
    expect((await row(t, connectionId))?.refreshLeaseId).toBeUndefined()
  })

  test("a stale or foreign lease cannot overwrite the winner", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const connectionId = await seed(t, userId, {
      tokenExpiresAt: Date.now() - 1,
      renewalCipher: RENEWAL,
      credentialVersion: 7,
    })
    await begin(t, { userId, connectionId })

    const result = await t.mutation(api.service.connections.finishRefresh, {
      serviceToken: SERVICE_TOKEN,
      userId,
      connectorId: "careerpack",
      connectionId,
      expectedVersion: 6,
      leaseId: "lease_foreign123456",
      tokenCipher: TOKEN_TWO,
      renewalCipher: RENEWAL_TWO,
    })

    expect(result).toEqual({ updated: false })
    expect((await row(t, connectionId))?.tokenCipher).toBe(TOKEN)
    expect((await row(t, connectionId))?.credentialVersion).toBe(7)
  })

  test("a transient abort releases the lease; a permanent one requires reconnect", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const transientId = await seed(t, userId, {
      tokenExpiresAt: Date.now() - 1,
      renewalCipher: RENEWAL,
    })
    await begin(t, { userId, connectionId: transientId })
    expect(
      await t.mutation(api.service.connections.abortRefresh, {
        serviceToken: SERVICE_TOKEN,
        userId,
        connectorId: "careerpack",
        connectionId: transientId,
        expectedVersion: 1,
        leaseId: LEASE,
        permanent: false,
      }),
    ).toEqual({ updated: true })
    expect(await row(t, transientId)).toMatchObject({ status: "active" })
    expect((await row(t, transientId))?.refreshLeaseId).toBeUndefined()

    const permanentId = await seed(t, userId, {
      connectorId: "mso",
      tokenExpiresAt: Date.now() - 1,
      renewalCipher: RENEWAL,
    })
    const permanentLease = "lease_permanent12345"
    await begin(t, {
      userId,
      connectorId: "mso",
      connectionId: permanentId,
      leaseId: permanentLease,
    })
    await t.mutation(api.service.connections.abortRefresh, {
      serviceToken: SERVICE_TOKEN,
      userId,
      connectorId: "mso",
      connectionId: permanentId,
      expectedVersion: 1,
      leaseId: permanentLease,
      permanent: true,
    })
    expect((await row(t, permanentId))?.status).toBe("expired")
  })
})
