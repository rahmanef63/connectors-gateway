import { describe, expect, test } from "vitest"
import { api } from "../../_generated/api"
import {
  asUser,
  createUser,
  expectRejected,
  setupConvex,
  type TestClient,
} from "../../test.helpers"

async function seedConnection(t: TestClient, ownerId: string, connectorId: string): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("connections", {
      connectorId,
      ownerType: "user",
      ownerId,
      authType: "bearer",
      status: "active",
      baseUrl: "https://api.example.test",
      tokenCipher: "v1.SEALED-CIPHERTEXT",
    })
  })
}

describe("features/connections/queries:listMine", () => {
  test("returns the caller's connections without the sealed token", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await seedConnection(t, userId, "careerpack")

    const connections = await asUser(t, userId).query(
      api.features.connections.queries.listMine,
      {},
    )

    expect(connections).toHaveLength(1)
    expect(connections[0]?.connectorId).toBe("careerpack")
    expect(connections[0]).not.toHaveProperty("tokenCipher")
    expect(JSON.stringify(connections)).not.toContain("SEALED-CIPHERTEXT")
  })

  test("never returns another user's connection", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await seedConnection(t, theirs, "careerpack")

    const connections = await asUser(t, mine).query(api.features.connections.queries.listMine, {})
    expect(connections).toEqual([])
  })

  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await seedConnection(t, userId, "careerpack")

    await expectRejected(t.query(api.features.connections.queries.listMine, {}), "NOT_AUTHORIZED")
  })
})
