import { describe, expect, test } from "vitest"
import { api } from "../../_generated/api"
import { asUser, createUser, expectRejected, setupConvex } from "../../test.helpers"

describe("features/auth/queries:viewer", () => {
  test("an unauthenticated caller is rejected", async () => {
    const t = setupConvex()

    await expectRejected(t.query(api.features.auth.queries.viewer, {}), "NOT_AUTHORIZED")
  })

  test("returns the caller's own email", async () => {
    const t = setupConvex()
    const userId = await createUser(t, "owner@example.test")

    const viewer = await asUser(t, userId).query(api.features.auth.queries.viewer, {})

    expect(viewer).toEqual({ email: "owner@example.test" })
  })

  test("a user row with no email resolves to null rather than crashing the shell", async () => {
    const t = setupConvex()
    const userId = await createUser(t)

    const viewer = await asUser(t, userId).query(api.features.auth.queries.viewer, {})

    expect(viewer).toEqual({ email: null })
  })

  test("one user never sees another user's email", async () => {
    const t = setupConvex()
    const mine = await createUser(t, "mine@example.test")
    await createUser(t, "theirs@example.test")

    const viewer = await asUser(t, mine).query(api.features.auth.queries.viewer, {})

    expect(viewer.email).toBe("mine@example.test")
  })
})
