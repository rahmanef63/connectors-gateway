/**
 * End-to-end through the agent's own wiring: hello -> welcome (key pinned on
 * first use) -> signed job -> allowlist -> adapter -> result frame. Only the
 * WebSocket itself is faked; every other component is the real one.
 */
import { describe, expect, test } from "bun:test"
import type { CapabilityReport } from "@cg/core"
import {
  PROTOCOL_VERSION,
  createJobEnvelope,
  createMemoryReplayGuard,
  generateSigningKeyPair,
  importPrivateKey,
  signJob,
} from "@cg/protocol"
import type { AgentMessage, JobEnvelope, SignedJob } from "@cg/protocol"
import type { LocalAdapter } from "@cg/sdk"
import { createAdapterRegistry } from "./adapters"
import type { AgentConfig } from "./config"
import { createJobRunner } from "./jobs"
import { createKeyStore } from "./key-store"
import { silentLogger } from "./log"
import { createSession } from "./session"
import type { AgentSocket, SocketEvents, SocketFactory } from "./socket"

const RENDER = "blender.scene.render"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const config: AgentConfig = {
  deviceId: "dev_int",
  credential: "cgd_integration_credential",
  gatewayUrl: "wss://gateway.example.com/device",
  disabledActions: [],
}

const capability: CapabilityReport = {
  connector: "blender",
  status: "available",
  adapterVersion: "0.1.0",
  capabilities: ["scene.render"],
}

function adapter(): LocalAdapter {
  return {
    manifest: {
      id: "blender",
      name: "Blender",
      version: "0.1.0",
      executor: "local",
      auth: { type: "device" },
      actions: [
        {
          id: RENDER,
          title: "Render",
          description: "Render the current scene.",
          inputSchema: { type: "object" },
          risk: "R2",
          annotations: { readOnly: false, destructive: false },
          requiredCapabilities: ["scene.render"],
        },
      ],
    },
    detect: async () => capability,
    execute: async (actionId, input) => ({ output: { rendered: actionId, input } }),
  }
}

async function gateway() {
  const pair = await generateSigningKeyPair()
  const privateKey = await importPrivateKey(pair.privateKey)
  const sent: string[] = []
  let events: SocketEvents | undefined

  const connect: SocketFactory = (_url, handlers) => {
    events = handlers
    const socket: AgentSocket = { send: (data) => void sent.push(data), close: () => {} }
    return socket
  }

  const keys = createKeyStore()
  const registry = createAdapterRegistry([adapter()])
  const runner = createJobRunner({
    registry,
    verify: keys.verify,
    replay: createMemoryReplayGuard(),
    disabledActions: config.disabledActions,
  })
  const session = createSession({
    config,
    registry,
    runner,
    keys,
    platform: "linux",
    connect,
    logger: silentLogger,
    schedule: () => {},
  })

  return {
    session,
    keys,
    sent,
    frames: () => sent.map((raw) => JSON.parse(raw) as AgentMessage),
    fire: () => {
      if (events === undefined) throw new Error("the session never dialled out")
      return events
    },
    welcome: () =>
      JSON.stringify({
        type: "welcome",
        deviceId: config.deviceId,
        protocolVersion: PROTOCOL_VERSION,
        signingPublicKey: pair.publicKey,
        keyId: "k1",
      }),
    job: async (overrides: Partial<JobEnvelope> = {}): Promise<{ raw: string; signed: SignedJob }> => {
      const envelope: JobEnvelope = {
        ...createJobEnvelope({
          connector: "blender",
          action: RENDER,
          input: { samples: 8 },
          requestContext: { requestId: "req_int", userId: "usr_int" },
        }),
        ...overrides,
      }
      const signed = await signJob(envelope, { privateKey, keyId: "k1" })
      return { raw: JSON.stringify({ type: "job", job: signed }), signed }
    },
  }
}

describe("agent <-> gateway wire", () => {
  test("pins the key from welcome, then runs a signed job and returns its result", async () => {
    const gw = await gateway()
    gw.session.start()
    gw.fire().open()
    await sleep(2)

    const hello = gw.frames()[0]
    expect(hello?.type).toBe("hello")

    gw.fire().message(gw.welcome())
    await sleep(2)
    expect(gw.keys.pinned()?.keyId).toBe("k1")
    expect(gw.session.state()).toBe("online")

    const { raw, signed } = await gw.job()
    gw.fire().message(raw)
    await sleep(5)

    const result = gw.frames().find((frame) => frame.type === "result")
    expect(result?.type).toBe("result")
    if (result?.type !== "result") throw new Error("unreachable")
    expect(result.result.jobId).toBe(signed.payload.id)
    expect(result.result.status).toBe("success")
    expect(result.result.output).toEqual({ rendered: RENDER, input: { samples: 8 } })
  })

  test("DENIED: a job that arrives before any key is pinned is not executed", async () => {
    const gw = await gateway()
    gw.session.start()
    gw.fire().open()
    await sleep(2)

    const { raw } = await gw.job()
    gw.fire().message(raw)
    await sleep(5)

    const result = gw.frames().find((frame) => frame.type === "result")
    if (result?.type !== "result") throw new Error("no result frame")
    expect(result.result.status).toBe("error")
    expect(result.result.error?.code).toBe("NOT_AUTHORIZED")
  })

  test("DENIED: the same job replayed twice is refused the second time", async () => {
    const gw = await gateway()
    gw.session.start()
    gw.fire().open()
    await sleep(2)
    gw.fire().message(gw.welcome())
    await sleep(2)

    const { raw } = await gw.job()
    gw.fire().message(raw)
    await sleep(5)
    gw.fire().message(raw)
    await sleep(5)

    const results = gw.frames().filter((frame) => frame.type === "result")
    expect(results).toHaveLength(2)
    const [first, second] = results
    if (first?.type !== "result" || second?.type !== "result") throw new Error("unreachable")
    expect(first.result.status).toBe("success")
    expect(second.result.error?.code).toBe("REPLAY_DETECTED")
  })

  test("no frame the agent sends ever repeats the credential after hello", async () => {
    const gw = await gateway()
    gw.session.start()
    gw.fire().open()
    await sleep(2)
    gw.fire().message(gw.welcome())
    const { raw } = await gw.job()
    gw.fire().message(raw)
    await sleep(5)

    expect(gw.sent[0]).toContain(config.credential)
    for (const frame of gw.sent.slice(1)) expect(frame).not.toContain(config.credential)
  })
})
