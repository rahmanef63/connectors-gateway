import { describe, expect, test } from "vitest"
import { api } from "../../_generated/api"
import {
  asUser,
  createUser,
  expectRejected,
  setupConvex,
  SERVICE_TOKEN,
} from "../../test.helpers"

describe("features/policy/mutations:setRule", () => {
  test("creates then updates a rule in place", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    await asUser(t, userId).mutation(api.features.policy.mutations.setRule, {
      connectorId: "blender",
      actionId: "scene.render",
      decision: "ALLOW",
    })
    await asUser(t, userId).mutation(api.features.policy.mutations.setRule, {
      connectorId: "blender",
      actionId: "scene.render",
      decision: "REQUIRE_APPROVAL",
    })

    const rules = await asUser(t, userId).query(api.features.policy.queries.listMine, {})
    expect(rules).toEqual([
      { connectorId: "blender", actionId: "scene.render", decision: "REQUIRE_APPROVAL" },
    ])
  })

  test("accepts the wildcard action", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    await asUser(t, userId).mutation(api.features.policy.mutations.setRule, {
      connectorId: "blender",
      actionId: "*",
      decision: "DENY",
    })

    const rules = await asUser(t, userId).query(api.features.policy.queries.listMine, {})
    expect(rules[0]?.actionId).toBe("*")
  })

  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()

    await expectRejected(
      t.mutation(api.features.policy.mutations.setRule, {
        connectorId: "blender",
        actionId: "scene.render",
        decision: "ALLOW",
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("rejects a malformed connector or action id", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    await expectRejected(
      asUser(t, userId).mutation(api.features.policy.mutations.setRule, {
        connectorId: "blender/../careerpack",
        actionId: "scene.render",
        decision: "ALLOW",
      }),
      "INVALID_INPUT",
    )
    await expectRejected(
      asUser(t, userId).mutation(api.features.policy.mutations.setRule, {
        connectorId: "blender",
        actionId: "scene render",
        decision: "ALLOW",
      }),
      "INVALID_INPUT",
    )
  })

  test("writes into the caller's own policy set, never another user's", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await asUser(t, theirs).mutation(api.features.policy.mutations.setRule, {
      connectorId: "blender",
      actionId: "scene.render",
      decision: "DENY",
    })

    await asUser(t, mine).mutation(api.features.policy.mutations.setRule, {
      connectorId: "blender",
      actionId: "scene.render",
      decision: "ALLOW",
    })

    const theirRules = await t.query(api.service.policy.listRules, {
      serviceToken: SERVICE_TOKEN,
      userId: theirs,
      connectorId: "blender",
    })
    expect(theirRules).toEqual([
      { connectorId: "blender", actionId: "scene.render", decision: "DENY" },
    ])
  })
})

describe("features/policy/queries:listMine", () => {
  test("returns only the caller's rules", async () => {
    const t = setupConvex()
    const mine = await createUser(t)
    const theirs = await createUser(t)
    await asUser(t, mine).mutation(api.features.policy.mutations.setRule, {
      connectorId: "blender",
      actionId: "scene.render",
      decision: "ALLOW",
    })
    await asUser(t, theirs).mutation(api.features.policy.mutations.setRule, {
      connectorId: "careerpack",
      actionId: "*",
      decision: "DENY",
    })

    const rules = await asUser(t, mine).query(api.features.policy.queries.listMine, {})
    expect(rules).toHaveLength(1)
    expect(rules[0]?.connectorId).toBe("blender")
  })

  test("rejects an unauthenticated caller", async () => {
    const t = setupConvex()
    await expectRejected(t.query(api.features.policy.queries.listMine, {}), "NOT_AUTHORIZED")
  })
})
