import { describe, expect, test } from "bun:test"
import { issueDeviceCredential } from "@cg/auth"
import type { ControlPlaneClient } from "./client"
import { createDeviceStore } from "./devices"

const ISSUED = await issueDeviceCredential("dev_1")

function row(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: "dev_1",
    userId: "usr_1",
    displayName: "Workstation",
    platform: "linux",
    status: "online",
    credentialVersion: 1,
    capabilities: ["blender:scene.render"],
    credentialHash: ISSUED.credentialHash,
    ...overrides,
  }
}

function client(response: unknown, mutations: { args: unknown }[] = []): ControlPlaneClient {
  return {
    query: async () => response,
    mutation: async (_ref, args) => {
      mutations.push({ args })
      return null
    },
  }
}

describe("authenticateDevice", () => {
  test("accepts the credential that was issued for the device", async () => {
    const store = createDeviceStore(client(row()))
    const result = await store.authenticateDevice("dev_1", ISSUED.credential)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.device.id).toBe("dev_1")
  })

  test("never returns the credential hash to its caller", async () => {
    const store = createDeviceStore(client(row()))
    const result = await store.authenticateDevice("dev_1", ISSUED.credential)
    expect(JSON.stringify(result)).not.toContain("pbkdf2")
  })

  test("a wrong secret is unauthorized", async () => {
    const store = createDeviceStore(client(row()))
    const result = await store.authenticateDevice("dev_1", "cgd_dev_1_" + "a".repeat(32))
    expect(result).toEqual({ ok: false, reason: "unauthorized" })
  })

  test("a credential for a different device is unauthorized", async () => {
    const store = createDeviceStore(client(row({ deviceId: "dev_2" })))
    const result = await store.authenticateDevice("dev_2", ISSUED.credential)
    expect(result).toEqual({ ok: false, reason: "unauthorized" })
  })

  test("a revoked device is reported as revoked, even with a valid credential", async () => {
    const store = createDeviceStore(client(row({ status: "revoked" })))
    const result = await store.authenticateDevice("dev_1", ISSUED.credential)
    expect(result).toEqual({ ok: false, reason: "revoked" })
  })

  test("an unknown device is unauthorized", async () => {
    const store = createDeviceStore(client(null))
    expect(await store.authenticateDevice("dev_x", ISSUED.credential)).toEqual({
      ok: false,
      reason: "unauthorized",
    })
  })

  test("a malformed row is unauthorized rather than partially trusted", async () => {
    const store = createDeviceStore(client(row({ status: "sudo" })))
    expect(await store.authenticateDevice("dev_1", ISSUED.credential)).toEqual({
      ok: false,
      reason: "unauthorized",
    })
  })
})

describe("DeviceStore port", () => {
  test("authenticate() collapses both failure reasons to null", async () => {
    const store = createDeviceStore(client(row({ status: "revoked" })))
    expect(await store.authenticate("dev_1", ISSUED.credential)).toBeNull()
  })

  /**
   * `service/devices:getRecord` now returns revoked rows so the relay can tell
   * 4003 from 4001, so the fail-closed default moved here: the generic port
   * still reports a revoked device as absent.
   */
  test("get() reports a revoked device as absent", async () => {
    const store = createDeviceStore(client(row({ status: "revoked" })))
    expect(await store.get("dev_1")).toBeNull()
  })

  test("setPresence omits capabilities when none are given", async () => {
    const mutations: { args: unknown }[] = []
    const store = createDeviceStore(client(null, mutations))
    await store.setPresence("dev_1", false)
    expect(mutations[0]?.args).toEqual({ deviceId: "dev_1", online: false })
  })

  test("revoke is refused: the gateway must not act for a user", async () => {
    const store = createDeviceStore(client(null))
    await expect(store.revoke("dev_1", "usr_1")).rejects.toMatchObject({ code: "NOT_AUTHORIZED" })
  })
})
