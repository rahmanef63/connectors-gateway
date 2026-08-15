import { describe, expect, test } from "vitest"
import { api } from "../_generated/api"
import {
  createUser,
  expectRejected,
  setupConvex,
  SERVICE_TOKEN,
  WRONG_SERVICE_TOKEN,
  type TestClient,
} from "../test.helpers"

async function seedConnection(
  t: TestClient,
  ownerId: string,
  overrides: Partial<{ connectorId: string; status: "active" | "revoked" }> = {},
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("connections", {
      connectorId: overrides.connectorId ?? "careerpack",
      ownerType: "user",
      ownerId,
      authType: "bearer",
      status: overrides.status ?? "active",
      baseUrl: "https://api.example.test",
      tokenCipher: "v1.aaaa.bbbb.cccc",
    })
  })
}

describe("service/policy:listRules", () => {
  test("returns only the requested user's rules for that connector", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await t.run(async (ctx) => {
      await ctx.db.insert("policyRules", {
        userId: mine,
        connectorId: "blender",
        actionId: "scene.render",
        decision: "ALLOW",
      })
      await ctx.db.insert("policyRules", {
        userId: mine,
        connectorId: "careerpack",
        actionId: "*",
        decision: "DENY",
      })
      await ctx.db.insert("policyRules", {
        userId: theirs,
        connectorId: "blender",
        actionId: "scene.render",
        decision: "DENY",
      })
    })

    const rules = await t.query(api.service.policy.listRules, {
      serviceToken: SERVICE_TOKEN,
      userId: mine,
      connectorId: "blender",
    })

    expect(rules).toEqual([{ connectorId: "blender", actionId: "scene.render", decision: "ALLOW" }])
  })

  test("rejects a wrong service token", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await expectRejected(
      t.query(api.service.policy.listRules, {
        serviceToken: WRONG_SERVICE_TOKEN,
        userId,
        connectorId: "blender",
      }),
      "NOT_AUTHORIZED",
    )
  })
})

describe("service/connections", () => {
  test("listForUser is scoped to the owner", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await seedConnection(t, mine)
    await seedConnection(t, theirs, { connectorId: "blender" })

    const connections = await t.query(api.service.connections.listForUser, {
      serviceToken: SERVICE_TOKEN,
      userId: mine,
    })

    expect(connections).toHaveLength(1)
    expect(connections[0]?.connectorId).toBe("careerpack")
    expect(connections[0]?.ownerId).toBe(mine)
  })

  test("listForUser rejects a wrong service token", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await expectRejected(
      t.query(api.service.connections.listForUser, {
        serviceToken: WRONG_SERVICE_TOKEN,
        userId,
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("resolveCredential returns ciphertext for an active connection only", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await seedConnection(t, userId)

    const credential = await t.query(api.service.connections.resolveCredential, {
      serviceToken: SERVICE_TOKEN,
      userId,
      connectorId: "careerpack",
    })
    expect(credential?.tokenCipher).toBe("v1.aaaa.bbbb.cccc")
    expect(credential?.baseUrl).toBe("https://api.example.test")

    const missing = await t.query(api.service.connections.resolveCredential, {
      serviceToken: SERVICE_TOKEN,
      userId,
      connectorId: "blender",
    })
    expect(missing).toBeNull()
  })

  test("resolveCredential ignores a revoked connection", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await seedConnection(t, userId, { status: "revoked" })

    const credential = await t.query(api.service.connections.resolveCredential, {
      serviceToken: SERVICE_TOKEN,
      userId,
      connectorId: "careerpack",
    })
    expect(credential).toBeNull()
  })

  test("resolveCredential never crosses owners", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await seedConnection(t, theirs)

    const credential = await t.query(api.service.connections.resolveCredential, {
      serviceToken: SERVICE_TOKEN,
      userId: mine,
      connectorId: "careerpack",
    })
    expect(credential).toBeNull()
  })

  test("resolveCredential rejects a wrong service token", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await seedConnection(t, userId)
    await expectRejected(
      t.query(api.service.connections.resolveCredential, {
        serviceToken: WRONG_SERVICE_TOKEN,
        userId,
        connectorId: "careerpack",
      }),
      "NOT_AUTHORIZED",
    )
  })
})

describe("service/apiKeys:getRecord", () => {
  test("returns the record including status, and null for an unknown key", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await t.run(async (ctx) => {
      await ctx.db.insert("apiKeys", {
        keyId: "key_abc",
        userId,
        scopes: ["careerpack:read"],
        secretHash: "pbkdf2$sha256$210000$c2FsdA$aGFzaA",
        status: "revoked",
        label: "Laptop CLI",
      })
    })

    const record = await t.query(api.service.apiKeys.getRecord, {
      serviceToken: SERVICE_TOKEN,
      keyId: "key_abc",
    })
    expect(record?.status).toBe("revoked")
    expect(record?.scopes).toEqual(["careerpack:read"])

    const missing = await t.query(api.service.apiKeys.getRecord, {
      serviceToken: SERVICE_TOKEN,
      keyId: "key_nope",
    })
    expect(missing).toBeNull()
  })

  test("rejects a wrong service token", async () => {
    const t = setupConvex()
    await expectRejected(
      t.query(api.service.apiKeys.getRecord, {
        serviceToken: WRONG_SERVICE_TOKEN,
        keyId: "key_abc",
      }),
      "NOT_AUTHORIZED",
    )
  })
})

describe("service/audit:append", () => {
  const event = {
    requestId: "req_1",
    timestamp: 1_700_000_000_000,
    actorId: "key_abc",
    userId: "placeholder",
    connectorId: "blender",
    actionId: "scene.render",
    executorKind: "local" as const,
    policyDecision: "ALLOW" as const,
    status: "success" as const,
    latencyMs: 42,
  }

  test("appends an event a service caller supplies", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    await t.mutation(api.service.audit.append, {
      serviceToken: SERVICE_TOKEN,
      event: { ...event, userId },
    })

    const rows = await t.run(async (ctx) => ctx.db.query("auditLogs").take(10))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.requestId).toBe("req_1")
  })

  test("rejects a wrong service token and writes nothing", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    await expectRejected(
      t.mutation(api.service.audit.append, {
        serviceToken: WRONG_SERVICE_TOKEN,
        event: { ...event, userId },
      }),
      "NOT_AUTHORIZED",
    )
    const rows = await t.run(async (ctx) => ctx.db.query("auditLogs").take(10))
    expect(rows).toHaveLength(0)
  })

  test("rejects a negative latency", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    await expectRejected(
      t.mutation(api.service.audit.append, {
        serviceToken: SERVICE_TOKEN,
        event: { ...event, userId, latencyMs: -1 },
      }),
      "INVALID_INPUT",
    )
  })
})
