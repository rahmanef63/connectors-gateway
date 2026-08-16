import { afterEach, describe, expect, test } from "bun:test"
import { CLOSE_CODES, PROTOCOL_VERSION } from "@cg/protocol"
import { makeDevice, silentLogger } from "../__tests__/fixtures"
import type { DeviceAuthResult, GatewayDeviceStore } from "../store/devices"
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

function deviceStore(result: DeviceAuthResult, presence: Presence[]): GatewayDeviceStore {
  return {
    get: async () => null,
    listForUser: async () => [],
    authenticate: async () => null,
    setPresence: async (deviceId, online, capabilities) => {
      presence.push(capabilities ? { deviceId, online, capabilities } : { deviceId, online })
    },
    authenticateDevice: async () => result,
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

function build(result: DeviceAuthResult, presence: Presence[] = []): Relay {
  relay = createRelay({
    devices: deviceStore(result, presence),
    logger: silentLogger,
    signingPublicKey: "cHVibGlj",
    keyId: "k1",
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

  test("a revoked device is closed with 4003 and never registered", async () => {
    const presence: Presence[] = []
    const instance = build({ ok: false, reason: "revoked" }, presence)
    const { socket, closed } = fakeSocket(instance.newState())

    await instance.websocket.message?.(socket, HELLO)

    expect(closed[0]?.code).toBe(CLOSE_CODES.REVOKED)
    expect(instance.sockets.get("dev_1")).toBeUndefined()
    expect(presence).toHaveLength(0)
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
