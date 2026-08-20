import { afterEach, describe, expect, test } from "bun:test"
import { CLOSE_CODES, PROTOCOL_VERSION, createJobEnvelope } from "@cg/protocol"
import type { Device } from "@cg/core"
import { makeDevice, silentLogger } from "../__tests__/fixtures"
import type { DeviceAuthResult, GatewayDeviceStore } from "../store/devices"
import type { RelayRouteStore } from "../store/relay-routes"
import { createRelay } from "./relay"
import type { Relay } from "./relay"
import type { RelaySocket, SocketState } from "./types"

type Closed = { code: number; reason: string }

function fakeSocket(state: SocketState): {
  socket: RelaySocket
  sent: string[]
  closed: Closed[]
} {
  const sent: string[] = []
  const closed: Closed[] = []
  const socket = {
    data: state,
    send: (data: string) => {
      sent.push(data)
      return data.length
    },
    close: (code: number, reason: string) => closed.push({ code, reason }),
  } as unknown as RelaySocket
  return { socket, sent, closed }
}

type Presence = { deviceId: string; online: boolean; capabilities?: string[] }

function deviceStore(
  result: DeviceAuthResult,
  presence: Presence[],
  overrides: Partial<GatewayDeviceStore> = {},
): GatewayDeviceStore {
  return {
    get: async () => (result.ok ? result.device : null),
    listForUser: async () => [],
    authenticate: async () => null,
    setPresence: async (deviceId, online, capabilities) => {
      presence.push(capabilities ? { deviceId, online, capabilities } : { deviceId, online })
    },
    authenticateDevice: async () => result,
    ...overrides,
  }
}

const HELLO = JSON.stringify({
  type: "hello",
  protocolVersion: PROTOCOL_VERSION,
  deviceId: "dev_1",
  credential: "cgd_dev_1_abcdefabcdefabcdef",
  platform: "linux",
  agentVersion: "0.1.0",
  capabilities: [
    { connector: "blender", status: "available", adapterVersion: "0.1.0", capabilities: ["scene.render"] },
  ],
})

let relay: Relay | null = null

function routeStore(overrides: Partial<RelayRouteStore> = {}): RelayRouteStore {
  return {
    claim: async () => true,
    refresh: async () => true,
    release: async () => true,
    resolve: async () => null,
    ...overrides,
  }
}

function build(
  result: DeviceAuthResult,
  presence: Presence[] = [],
  store: Partial<GatewayDeviceStore> = {},
  keyRotation?: { previousKeyId: string; nextKeyId: string; nextPublicKey: string; signature: string },
  routes: RelayRouteStore = routeStore(),
): Relay {
  relay = createRelay({
    devices: deviceStore(result, presence, store),
    logger: silentLogger,
    signingPublicKey: "cHVibGlj",
    keyId: "k1",
    gatewayId: "gw_testgateway111111",
    internalUrl: "http://10.0.0.2:8787",
    routes,
    ...(keyRotation === undefined ? {} : { keyRotation }),
  })
  return relay
}

afterEach(() => {
  relay?.stop()
  relay = null
})

describe("relay websocket handlers", () => {
  test("a non-hello frame on an unauthenticated socket is closed with 4001", async () => {
    const instance = build({ ok: true, device: makeDevice() })
    const { socket, closed } = fakeSocket(instance.newState())
    await instance.websocket.message?.(socket, JSON.stringify({ type: "heartbeat" }))
    expect(closed[0]?.code).toBe(CLOSE_CODES.UNAUTHORIZED)
    expect(socket.data.authenticated).toBe(false)
  })

  test("an unparseable frame on an unauthenticated socket is closed, never echoed", async () => {
    const instance = build({ ok: true, device: makeDevice() })
    const { socket, sent, closed } = fakeSocket(instance.newState())
    await instance.websocket.message?.(socket, "{not json")
    expect(closed[0]?.code).toBe(CLOSE_CODES.UNAUTHORIZED)
    expect(sent).toHaveLength(0)
  })

  test("a binary frame is refused", async () => {
    const instance = build({ ok: true, device: makeDevice() })
    const { socket, closed } = fakeSocket(instance.newState())
    await instance.websocket.message?.(socket, Buffer.from("hello"))
    expect(closed[0]?.code).toBe(CLOSE_CODES.UNSUPPORTED)
  })

  test("hello authenticates, registers presence and replies with welcome", async () => {
    const presence: Presence[] = []
    const instance = build({ ok: true, device: makeDevice() }, presence)
    const { socket, sent } = fakeSocket(instance.newState())

    await instance.websocket.message?.(socket, HELLO)

    expect(socket.data.authenticated).toBe(true)
    expect(socket.data.deviceId).toBe("dev_1")
    expect(instance.sockets.get("dev_1")).toBe(socket)
    expect(presence[0]).toEqual({
      deviceId: "dev_1",
      online: true,
      capabilities: ["blender:scene.render"],
    })

    const welcome = JSON.parse(sent[0] ?? "{}")
    expect(welcome.type).toBe("welcome")
    expect(welcome.signingPublicKey).toBe("cHVibGlj")
    // The device credential is never echoed back.
    expect(sent.join("")).not.toContain("abcdefabcdef")
  })

  test("welcome can carry a signed rotation proof without changing legacy fields", async () => {
    const proof = {
      previousKeyId: "k0",
      nextKeyId: "k1",
      nextPublicKey: "cHVibGlj",
      signature: "rotation_signature",
    }
    const instance = build({ ok: true, device: makeDevice() }, [], {}, proof)
    const { socket, sent } = fakeSocket(instance.newState())
    await instance.websocket.message?.(socket, HELLO)
    const welcome = JSON.parse(sent[0] ?? "{}") as Record<string, unknown>
    expect(welcome["keyId"]).toBe("k1")
    expect(welcome["signingPublicKey"]).toBe("cHVibGlj")
    expect(welcome["keyRotation"]).toEqual(proof)
  })

  test("a revoked device is closed with 4003 and never registered", async () => {
    const presence: Presence[] = []
    const instance = build({ ok: false, reason: "revoked" }, presence)
    const { socket, closed } = fakeSocket(instance.newState())

    await instance.websocket.message?.(socket, HELLO)

    expect(closed[0]?.code).toBe(CLOSE_CODES.REVOKED)
    expect(instance.sockets.get("dev_1")).toBeUndefined()
    expect(presence).toHaveLength(0)
  })

  test("an already-open socket is removed and closed when its durable row is revoked", async () => {
    let current: Device | null = makeDevice()
    const instance = build(
      { ok: true, device: current },
      [],
      { get: async () => current },
    )
    const { socket, sent, closed } = fakeSocket(instance.newState())
    await instance.websocket.message?.(socket, HELLO)

    current = null
    expect(await instance.revalidate()).toBe(1)

    expect(instance.sockets.get("dev_1")).toBeUndefined()
    expect(socket.data.authenticated).toBe(false)
    expect(JSON.parse(sent.at(-1) ?? "{}")).toEqual({
      type: "revoked",
      reason: "Device access was revoked.",
    })
    expect(closed.at(-1)).toEqual({ code: CLOSE_CODES.REVOKED, reason: "device revoked" })
  })

  test("revocation rejects in-flight work as DEVICE_REVOKED before the close event", async () => {
    let current: Device | null = makeDevice()
    const instance = build(
      { ok: true, device: current },
      [],
      { get: async () => current },
    )
    const { socket } = fakeSocket(instance.newState())
    await instance.websocket.message?.(socket, HELLO)

    const job = {
      payload: createJobEnvelope({
        connector: "blender",
        action: "blender.scene.render",
        input: {},
        requestContext: { requestId: "req_revoke", userId: "usr_1" },
      }),
      signature: "c2ln",
      keyId: "k1",
    }
    const pending = instance.dispatcher.dispatch("dev_1", job, 1_000)
    current = null
    await instance.revalidate()

    await expect(pending).rejects.toMatchObject({ code: "DEVICE_REVOKED" })
    expect(instance.dispatcher.pendingCount()).toBe(0)
  })

  test("a temporary control-plane failure leaves a healthy session connected for retry", async () => {
    const live = makeDevice()
    const instance = build(
      { ok: true, device: live },
      [],
      { get: async () => { throw new Error("control plane unavailable") } },
    )
    const { socket, closed } = fakeSocket(instance.newState())
    await instance.websocket.message?.(socket, HELLO)

    expect(await instance.revalidate()).toBe(0)
    expect(instance.sockets.get("dev_1")).toBe(socket)
    expect(closed).toHaveLength(0)
  })

  test("an old revalidation read cannot close a replacement socket", async () => {
    const live = makeDevice()
    let release: ((value: Device | null) => void) | undefined
    const waiting = new Promise<Device | null>((resolve) => { release = resolve })
    const instance = build(
      { ok: true, device: live },
      [],
      { get: async () => waiting },
    )
    const first = fakeSocket(instance.newState())
    await instance.websocket.message?.(first.socket, HELLO)
    const checking = instance.revalidate()

    const second = fakeSocket(instance.newState())
    await instance.websocket.message?.(second.socket, HELLO)
    release?.(null)

    expect(await checking).toBe(0)
    expect(instance.sockets.get("dev_1")).toBe(second.socket)
    expect(second.closed).toHaveLength(0)
    expect(first.closed.at(-1)?.reason).toBe("replaced by a newer session")
  })

  test("a second hello on an authenticated socket is a protocol violation", async () => {
    const instance = build({ ok: true, device: makeDevice() })
    const { socket, closed } = fakeSocket(instance.newState())
    await instance.websocket.message?.(socket, HELLO)
    await instance.websocket.message?.(socket, HELLO)
    expect(closed[0]?.code).toBe(CLOSE_CODES.UNSUPPORTED)
  })

  test("close marks the device offline and deregisters it", async () => {
    const presence: Presence[] = []
    const instance = build({ ok: true, device: makeDevice() }, presence)
    const { socket } = fakeSocket(instance.newState())

    await instance.websocket.message?.(socket, HELLO)
    instance.websocket.close?.(socket, 1000, "bye")
    await Promise.resolve()

    expect(instance.sockets.get("dev_1")).toBeUndefined()
    expect(presence.at(-1)).toEqual({ deviceId: "dev_1", online: false })
  })

  test("a cross-instance replacement closes the stale socket without marking the new owner offline", async () => {
    const presence: Presence[] = []
    let refreshes = 0
    const instance = build(
      { ok: true, device: makeDevice() },
      presence,
      {},
      undefined,
      routeStore({ refresh: async () => { refreshes += 1; return false }, release: async () => false }),
    )
    const { socket, closed } = fakeSocket(instance.newState())
    await instance.websocket.message?.(socket, HELLO)
    socket.data.presenceAt = 0
    socket.data.lastSeenAt = 60_000
    await instance.websocket.message?.(socket, JSON.stringify({ type: "heartbeat" }))
    expect(refreshes).toBe(1)
    expect(closed.at(-1)?.reason).toBe("replaced by a newer session")
    instance.websocket.close?.(socket, 4001, "replaced")
    await Promise.resolve()
    await Promise.resolve()
    expect(presence.filter((entry) => entry.online === false)).toHaveLength(0)
  })

  test("the heartbeat sweep closes a socket that stopped sending frames", async () => {
    const instance = build({ ok: true, device: makeDevice() })
    const { socket, closed } = fakeSocket(instance.newState())
    await instance.websocket.message?.(socket, HELLO)

    socket.data.lastSeenAt = 0
    expect(instance.sweep()).toBe(1)
    expect(closed[0]?.reason).toBe("heartbeat timeout")
  })

  test("an invalid frame on an AUTHENTICATED socket returns an error frame", async () => {
    const instance = build({ ok: true, device: makeDevice() })
    const { socket, sent, closed } = fakeSocket(instance.newState())
    await instance.websocket.message?.(socket, HELLO)
    await instance.websocket.message?.(socket, "{oops")

    expect(closed).toHaveLength(0)
    expect(JSON.parse(sent[1] ?? "{}")).toMatchObject({ type: "error", code: "INVALID_INPUT" })
  })


})
