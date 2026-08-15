import { describe, expect, test } from "bun:test"
import type { CapabilityReport } from "@cg/core"
import { CLOSE_CODES, PROTOCOL_VERSION, RECONNECT_BASE_MS, RECONNECT_MAX_MS } from "@cg/protocol"
import type { AgentMessage, AgentResult, SignedJob } from "@cg/protocol"
import { generateSigningKeyPair } from "@cg/protocol"
import { createAdapterRegistry } from "./adapters"
import type { AgentConfig } from "./config"
import { createKeyStore } from "./key-store"
import { createSession } from "./session"
import type { AgentSocket, SocketEvents, SocketFactory } from "./socket"
import type { JobRunner } from "./jobs"

const CREDENTIAL = "cgd_device_credential_value"
/** A real Ed25519 SPKI: the key store imports it before pinning. */
const REAL_PUBLIC_KEY = (await generateSigningKeyPair()).publicKey

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const config: AgentConfig = {
  deviceId: "dev_1",
  credential: CREDENTIAL,
  gatewayUrl: "wss://gateway.example.com/device",
  signingPublicKey: "PUBLIC_KEY_B64",
  keyId: "k1",
  disabledActions: [],
}

const report: CapabilityReport = {
  connector: "blender",
  status: "available",
  adapterVersion: "0.1.0",
  capabilities: ["scene.render"],
}

function registry() {
  return createAdapterRegistry([
    {
      manifest: { id: "blender", name: "Blender", version: "0.1.0", executor: "local", auth: { type: "device" }, actions: [] },
      detect: async () => report,
      execute: async () => ({ output: null }),
    },
  ])
}

type Harness = {
  factory: SocketFactory
  events(): SocketEvents
  sent: string[]
  closes: Array<number | undefined>
  opened: string[]
}

function harness(): Harness {
  const sent: string[] = []
  const closes: Array<number | undefined> = []
  const opened: string[] = []
  let events: SocketEvents | undefined
  const factory: SocketFactory = (url, handlers) => {
    opened.push(url)
    events = handlers
    const socket: AgentSocket = {
      send: (data) => void sent.push(data),
      close: (code) => void closes.push(code),
    }
    return socket
  }
  return {
    factory,
    events: () => {
      if (events === undefined) throw new Error("the session never opened a socket")
      return events
    },
    sent,
    closes,
    opened,
  }
}

function fakeRunner(overrides: Partial<JobRunner> = {}): JobRunner {
  return {
    run: async (signed: SignedJob): Promise<AgentResult> => ({
      jobId: signed.payload.id,
      status: "success",
      output: null,
      timingMs: 1,
    }),
    cancel: () => false,
    inflight: () => 0,
    ...overrides,
  }
}

function decode(raw: string | undefined): AgentMessage {
  if (raw === undefined) throw new Error("no frame was sent")
  return JSON.parse(raw) as AgentMessage
}

function welcome(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "welcome",
    deviceId: config.deviceId,
    protocolVersion: PROTOCOL_VERSION,
    signingPublicKey: config.signingPublicKey,
    keyId: config.keyId,
    ...overrides,
  })
}

type Scheduled = { fn: () => void; ms: number }

function session(hooks: { runner?: JobRunner } = {}) {
  const socket = harness()
  const scheduled: Scheduled[] = []
  const handle = createSession({
    config,
    registry: registry(),
    runner: hooks.runner ?? fakeRunner(),
    platform: "linux",
    connect: socket.factory,
    random: () => 0.5,
    schedule: (fn, ms) => void scheduled.push({ fn, ms }),
  })
  return { handle, socket, scheduled }
}

describe("createSession", () => {
  test("dials outbound and announces detected capabilities in hello", async () => {
    const { handle, socket } = session()
    handle.start()
    expect(socket.opened).toEqual([config.gatewayUrl])
    socket.events().open()
    await sleep(1)

    const hello = decode(socket.sent[0])
    expect(hello.type).toBe("hello")
    if (hello.type !== "hello") throw new Error("unreachable")
    expect(hello.deviceId).toBe(config.deviceId)
    expect(hello.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(hello.platform).toBe("linux")
    expect(hello.capabilities).toEqual([report])
    // The wire report stays connector-relative; the gateway namespaces it.
    expect(hello.capabilities[0]?.capabilities).toEqual(["scene.render"])
  })

  test("welcome brings the session online and resets the retry counter", async () => {
    const { handle, socket } = session()
    handle.start()
    socket.events().open()
    await sleep(1)
    socket.events().message(welcome())
    await sleep(1)
    expect(handle.state()).toBe("online")
    expect(handle.attempts()).toBe(0)
  })

  test("a job frame produces exactly one result frame", async () => {
    const { handle, socket } = session()
    handle.start()
    socket.events().open()
    await sleep(1)
    socket.events().message(
      JSON.stringify({
        type: "job",
        job: {
          keyId: "k1",
          signature: "sig",
          payload: {
            id: "job_1",
            protocolVersion: PROTOCOL_VERSION,
            issuedAt: 1,
            expiresAt: 2,
            connector: "blender",
            action: "blender.scene.render",
            input: {},
            requestContext: { requestId: "req_1", userId: "usr_1" },
            nonce: "nce_1",
          },
        },
      }),
    )
    await sleep(2)
    const frames = socket.sent.map((raw) => decode(raw).type)
    expect(frames.filter((type) => type === "result")).toHaveLength(1)
  })

  test("an unreadable frame is dropped and the session survives", async () => {
    const { handle, socket } = session()
    handle.start()
    socket.events().open()
    await sleep(1)
    socket.events().message("{not json")
    socket.events().message(JSON.stringify({ type: "nonsense" }))
    await sleep(1)
    expect(handle.state()).not.toBe("stopped")
  })

  test("an ordinary close reconnects with a bounded, growing delay", () => {
    const { handle, socket, scheduled } = session()
    handle.start()
    socket.events().close(1006, "")
    expect(handle.state()).toBe("offline")
    expect(scheduled).toHaveLength(1)
    const first = scheduled[0]
    if (first === undefined) throw new Error("nothing scheduled")
    expect(first.ms).toBeGreaterThanOrEqual(RECONNECT_BASE_MS)
    expect(first.ms).toBeLessThanOrEqual(RECONNECT_MAX_MS)

    first.fn()
    socket.events().close(1006, "")
    expect(handle.attempts()).toBe(2)
    expect(scheduled[1]?.ms ?? 0).toBeGreaterThan(first.ms)
  })

  test("STOPPED: close code 4001 (unauthorized) never reconnects", () => {
    const { handle, socket, scheduled } = session()
    handle.start()
    socket.events().close(CLOSE_CODES.UNAUTHORIZED, "")
    expect(handle.state()).toBe("stopped")
    expect(scheduled).toHaveLength(0)
  })

  test("STOPPED: close code 4003 (revoked) never reconnects", () => {
    const { handle, socket, scheduled } = session()
    handle.start()
    socket.events().close(CLOSE_CODES.REVOKED, "")
    expect(handle.state()).toBe("stopped")
    expect(scheduled).toHaveLength(0)
  })

  test("STOPPED: a revoked frame stops the session", async () => {
    const { handle, socket, scheduled } = session()
    handle.start()
    socket.events().open()
    await sleep(1)
    socket.events().message(JSON.stringify({ type: "revoked", reason: "owner revoked" }))
    await sleep(1)
    expect(handle.state()).toBe("stopped")
    expect(scheduled).toHaveLength(0)
  })

  test("STOPPED: a welcome for a different device id or protocol version", async () => {
    for (const bad of [{ deviceId: "dev_other" }, { protocolVersion: "99" }]) {
      const { handle, socket } = session()
      handle.start()
      socket.events().open()
      await sleep(1)
      socket.events().message(welcome(bad))
      expect(handle.state()).toBe("stopped")
    }
  })

  test("the announced signing key is pinned on first use", async () => {
    const lines: string[] = []
    const keys = createKeyStore()
    const socket = harness()
    const handle = createSession({
      config,
      registry: registry(),
      runner: fakeRunner(),
      keys,
      platform: "linux",
      connect: socket.factory,
      logger: { info: (m) => void lines.push(m), warn: (m) => void lines.push(m), error: (m) => void lines.push(m) },
      schedule: () => {},
    })
    handle.start()
    socket.events().open()
    await sleep(1)
    socket.events().message(welcome({ signingPublicKey: REAL_PUBLIC_KEY }))
    await sleep(5)
    expect(handle.state()).toBe("online")
    expect(keys.pinned()).toEqual({ signingPublicKey: REAL_PUBLIC_KEY, keyId: "k1" })
    expect(lines.some((line) => line.includes("pinned"))).toBe(true)
  })

  test("a DIFFERENT signing key is warned about, never adopted", async () => {
    const lines: string[] = []
    const keys = createKeyStore({ initial: { signingPublicKey: REAL_PUBLIC_KEY, keyId: "k1" } })
    const socket = harness()
    const handle = createSession({
      config,
      registry: registry(),
      runner: fakeRunner(),
      keys,
      platform: "linux",
      connect: socket.factory,
      logger: { info: (m) => void lines.push(m), warn: (m) => void lines.push(m), error: (m) => void lines.push(m) },
      schedule: () => {},
    })
    handle.start()
    socket.events().open()
    await sleep(1)
    socket.events().message(welcome({ signingPublicKey: REAL_PUBLIC_KEY, keyId: "k2" }))
    await sleep(5)
    expect(handle.state()).toBe("online")
    expect(keys.pinned()?.keyId).toBe("k1")
    expect(lines.some((line) => line.includes("job-signing key"))).toBe(true)
  })

  test("stop() closes the socket and refuses to reconnect", () => {
    const { handle, socket, scheduled } = session()
    handle.start()
    handle.stop()
    expect(socket.closes).toHaveLength(1)
    socket.events().close(1006, "")
    expect(scheduled).toHaveLength(0)
    expect(handle.state()).toBe("stopped")
  })

  test("no frame the session sends after hello contains the credential", async () => {
    const { handle, socket } = session()
    handle.start()
    socket.events().open()
    await sleep(1)
    socket.events().message(welcome())
    const afterHello = socket.sent.slice(1)
    for (const frame of afterHello) expect(frame).not.toContain(CREDENTIAL)
  })
})
