/**
 * Shared test scaffolding. Not a Convex module: the double dot in the file
 * name keeps it out of `entryPoints`, so it is never bundled or deployed.
 */
import { expect } from "vitest"
import { convexTest, type TestConvex } from "convex-test"
import type { Doc, Id } from "./_generated/dataModel"
import { errorCodeOf, type ControlPlaneErrorCode } from "./_shared/errors"
import schema from "./schema"

export const modules = import.meta.glob("./**/*.*s")

export const SERVICE_TOKEN = "test-service-token-3f9c1a"
/** Same length as the real one, so a length check cannot be what rejects it. */
export const WRONG_SERVICE_TOKEN = "test-service-token-3f9c1b"

export type TestClient = TestConvex<typeof schema>

export function setupConvex(): TestClient {
  process.env.GATEWAY_SERVICE_TOKEN = SERVICE_TOKEN
  delete process.env.ADMIN_EMAILS
  return convexTest(schema, modules)
}

export async function createUser(t: TestClient, email?: string): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", email === undefined ? {} : { email }),
  )
}

export function asUser(t: TestClient, userId: Id<"users">): TestClient {
  // getAuthUserId reads `subject` up to the "|" session divider.
  return t.withIdentity({ subject: `${userId}|session` }) as TestClient
}

export async function expectRejected(
  call: Promise<unknown>,
  code: ControlPlaneErrorCode,
): Promise<void> {
  try {
    await call
  } catch (error) {
    const actual = errorCodeOf(error)
    if (actual !== null) {
      expect(actual).toBe(code)
      return
    }
    expect(String(error)).toContain(code)
    return
  }
  throw new Error(`Expected the call to be rejected with ${code}.`)
}

type DeviceSeed = Omit<Doc<"devices">, "_id" | "_creationTime" | "userId">

export const DEVICE_FIXTURE: DeviceSeed = {
  deviceId: "dev_fixture0001",
  displayName: "Studio laptop",
  platform: "linux",
  status: "offline",
  credentialHash: "pbkdf2$sha256$210000$c2FsdA$aGFzaA",
  credentialVersion: 1,
  capabilities: ["blender:scene.render"],
}

export async function insertDevice(
  t: TestClient,
  userId: string,
  overrides: Partial<DeviceSeed> & { deviceId: string },
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("devices", { ...DEVICE_FIXTURE, ...overrides, userId })
  })
}
