import { describe, expect, test } from "vitest"
import { asUser, createUser, setupConvex, SERVICE_TOKEN } from "../test.helpers"
import { requireAdmin, requireService, requireUser } from "./auth"
import { errorCodeOf } from "./errors"

async function codeOf(call: Promise<unknown>): Promise<string | null> {
  try {
    await call
    return null
  } catch (error) {
    return errorCodeOf(error) ?? String(error)
  }
}

describe("requireUser", () => {
  test("returns the signed-in user id", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const resolved = await asUser(t, userId).run(async (ctx) => requireUser(ctx))
    expect(resolved).toBe(userId)
  })

  test("rejects an anonymous caller", async () => {
    const t = setupConvex()
    expect(await codeOf(t.run(async (ctx) => requireUser(ctx)))).toBe("NOT_AUTHORIZED")
  })
})

describe("requireAdmin", () => {
  test("accepts an email on the ADMIN_EMAILS allowlist, case and space insensitive", async () => {
    const t = setupConvex()
    const userId = await createUser(t, "Owner@Example.test")
    process.env.ADMIN_EMAILS = " root@example.test , owner@example.test "

    const resolved = await asUser(t, userId).run(async (ctx) => requireAdmin(ctx))
    expect(resolved).toBe(userId)
  })

  test("rejects a signed-in user who is not on the allowlist", async () => {
    const t = setupConvex()
    const userId = await createUser(t, "someone@example.test")
    process.env.ADMIN_EMAILS = "owner@example.test"

    expect(await codeOf(asUser(t, userId).run(async (ctx) => requireAdmin(ctx)))).toBe(
      "NOT_AUTHORIZED",
    )
  })

  test("fails closed when ADMIN_EMAILS is unset", async () => {
    const t = setupConvex()
    const userId = await createUser(t, "owner@example.test")
    delete process.env.ADMIN_EMAILS

    expect(await codeOf(asUser(t, userId).run(async (ctx) => requireAdmin(ctx)))).toBe(
      "NOT_AUTHORIZED",
    )
  })

  test("rejects a user with no email even when the allowlist is populated", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    process.env.ADMIN_EMAILS = "owner@example.test"

    expect(await codeOf(asUser(t, userId).run(async (ctx) => requireAdmin(ctx)))).toBe(
      "NOT_AUTHORIZED",
    )
  })

  test("rejects an anonymous caller", async () => {
    const t = setupConvex()
    process.env.ADMIN_EMAILS = "owner@example.test"
    expect(await codeOf(t.run(async (ctx) => requireAdmin(ctx)))).toBe("NOT_AUTHORIZED")
  })
})

describe("requireService", () => {
  test("accepts the configured token", async () => {
    const t = setupConvex()
    await t.run(async (ctx) => {
      requireService(ctx, SERVICE_TOKEN)
    })
  })

  test("rejects a wrong, empty, prefix and over-long token", async () => {
    const t = setupConvex()
    for (const token of [
      "nope",
      "",
      SERVICE_TOKEN.slice(0, -1),
      `${SERVICE_TOKEN}x`,
      SERVICE_TOKEN.toUpperCase(),
    ]) {
      expect(
        await codeOf(
          t.run(async (ctx) => {
            requireService(ctx, token)
          }),
        ),
      ).toBe("NOT_AUTHORIZED")
    }
  })

  test("fails closed when GATEWAY_SERVICE_TOKEN is unset", async () => {
    const t = setupConvex()
    delete process.env.GATEWAY_SERVICE_TOKEN
    try {
      expect(
        await codeOf(
          t.run(async (ctx) => {
            requireService(ctx, SERVICE_TOKEN)
          }),
        ),
      ).toBe("NOT_AUTHORIZED")
      expect(
        await codeOf(
          t.run(async (ctx) => {
            requireService(ctx, "")
          }),
        ),
      ).toBe("NOT_AUTHORIZED")
    } finally {
      process.env.GATEWAY_SERVICE_TOKEN = SERVICE_TOKEN
    }
  })

  test("never echoes the presented token", async () => {
    const t = setupConvex()
    const secret = "sk-live-should-never-appear"
    const message = await codeOf(
      t.run(async (ctx) => {
        requireService(ctx, secret)
      }),
    )
    expect(String(message)).not.toContain(secret)
  })
})
