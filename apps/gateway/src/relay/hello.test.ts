import { describe, expect, test } from "bun:test"
import { CLOSE_CODES, PROTOCOL_VERSION } from "@cg/protocol"
import type { CapabilityReport } from "@cg/core"
import { makeDevice } from "../__tests__/fixtures"
import type { DeviceAuthResult, GatewayDeviceStore } from "../store/devices"
import { authenticateHello, flattenCapabilities } from "./hello"
import type { HelloMessage } from "./hello"

function devices(result: DeviceAuthResult): GatewayDeviceStore {
  return {
    get: async () => null,
    listForUser: async () => [],
    authenticate: async () => null,
    setPresence: async () => {},
    authenticateDevice: async () => result,
  }
}

function report(overrides: Partial<CapabilityReport> = {}): CapabilityReport {
  return {
    connector: "blender",
    status: "available",
    adapterVersion: "0.1.0",
    capabilities: ["scene.render"],
    ...overrides,
  }
}

function hello(overrides: Partial<HelloMessage> = {}): HelloMessage {
  return {
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    deviceId: "dev_1",
    credential: "cgd_dev_1_abcdefabcdefabcdef",
    platform: "linux",
    agentVersion: "0.1.0",
    capabilities: [report()],
    ...overrides,
  }
}

describe("flattenCapabilities", () => {
  test("namespaces capabilities per connector", () => {
    expect(flattenCapabilities([report()])).toEqual(["blender:scene.render"])
  })

  test("an already-namespaced capability is not double-prefixed", () => {
    expect(flattenCapabilities([report({ capabilities: ["blender:scene.render"] })])).toEqual([
      "blender:scene.render",
    ])
  })

  test("an unavailable adapter contributes nothing", () => {
    expect(flattenCapabilities([report({ status: "unavailable" })])).toEqual([])
  })

  test("duplicates across reports collapse", () => {
    expect(flattenCapabilities([report(), report()])).toHaveLength(1)
  })
})

describe("authenticateHello", () => {
  test("accepts a verified device and returns its capabilities", async () => {
    const outcome = await authenticateHello(
      devices({ ok: true, device: makeDevice() }),
      hello(),
    )
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.capabilities).toEqual(["blender:scene.render"])
  })

  test("a bad credential closes with 4001", async () => {
    const outcome = await authenticateHello(
      devices({ ok: false, reason: "unauthorized" }),
      hello(),
    )
    expect(outcome).toMatchObject({ ok: false, code: CLOSE_CODES.UNAUTHORIZED })
  })

  test("a revoked device closes with 4003 so the agent stops retrying", async () => {
    const outcome = await authenticateHello(devices({ ok: false, reason: "revoked" }), hello())
    expect(outcome).toMatchObject({ ok: false, code: CLOSE_CODES.REVOKED })
  })

  test("a protocol mismatch closes with 4004 before any credential work", async () => {
    let called = false
    const store = devices({ ok: true, device: makeDevice() })
    store.authenticateDevice = async () => {
      called = true
      return { ok: true, device: makeDevice() }
    }
    const outcome = await authenticateHello(store, hello({ protocolVersion: "999" }))
    expect(outcome).toMatchObject({ ok: false, code: CLOSE_CODES.UNSUPPORTED })
    expect(called).toBe(false)
  })
})
