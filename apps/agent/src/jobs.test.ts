import { beforeAll, describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { ActionDefinition, CapabilityReport } from "@cg/core"
import {
  PROTOCOL_VERSION,
  createJobEnvelope,
  createMemoryReplayGuard,
  generateSigningKeyPair,
  importPrivateKey,
  signJob,
} from "@cg/protocol"
import type { JobEnvelope, SignedJob } from "@cg/protocol"
import type { AdapterOutput, LocalAdapter } from "@cg/sdk"
import { createAdapterRegistry } from "./adapters"
import type { AdapterRegistry } from "./adapters"
import { UNKNOWN_JOB_ID, createJobRunner } from "./jobs"
import { createJobVerifier } from "./verify"
import type { JobVerifier } from "./verify"

const CONNECTOR = "blender"
const RENDER = "blender.scene.render"

let keyPair: { privateKey: string; publicKey: string }
let privateKey: CryptoKey
let verify: JobVerifier

beforeAll(async () => {
  keyPair = await generateSigningKeyPair()
  privateKey = await importPrivateKey(keyPair.privateKey)
  verify = await createJobVerifier({ signingPublicKey: keyPair.publicKey, keyId: "k1" })
})

function action(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id: RENDER,
    title: "Render",
    description: "Render the current scene.",
    inputSchema: { type: "object" },
    risk: "R2",
    annotations: { readOnly: false, destructive: false },
    requiredCapabilities: ["scene.render"],
    ...overrides,
  }
}

type FakeOptions = {
  actions?: ActionDefinition[]
  capabilities?: string[]
  execute?: (actionId: string, input: unknown, signal: AbortSignal) => Promise<AdapterOutput>
}

function fakeAdapter(options: FakeOptions = {}): LocalAdapter {
  const actions = options.actions ?? [action()]
  const report: CapabilityReport = {
    connector: CONNECTOR,
    status: "available",
    adapterVersion: "0.1.0",
    capabilities: options.capabilities ?? ["scene.render"],
  }
  return {
    manifest: { id: CONNECTOR, name: "Blender", version: "0.1.0", executor: "local", auth: { type: "device" }, actions },
    detect: async () => report,
    execute: async (actionId, input, context) =>
      options.execute === undefined
        ? { output: { ok: true, actionId } }
        : options.execute(actionId, input, context.signal),
  }
}

async function registryWith(options: FakeOptions = {}): Promise<AdapterRegistry> {
  const registry = createAdapterRegistry([fakeAdapter(options)])
  await registry.detectAll()
  return registry
}

function envelope(overrides: Partial<JobEnvelope> = {}): JobEnvelope {
  const base = createJobEnvelope({
    connector: CONNECTOR,
    action: RENDER,
    input: { samples: 8 },
    requestContext: { requestId: "req_1", userId: "usr_1" },
  })
  return { ...base, ...overrides }
}

async function sign(payload: JobEnvelope, keyId = "k1"): Promise<SignedJob> {
  return signJob(payload, { privateKey, keyId })
}

async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition never became true")
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

async function runner(options: FakeOptions & { disabledActions?: string[]; timeoutMs?: number } = {}) {
  return createJobRunner({
    registry: await registryWith(options),
    verify,
    replay: createMemoryReplayGuard(),
    disabledActions: options.disabledActions ?? [],
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  })
}

describe("createJobRunner", () => {
  test("a valid signed job runs and returns a success result", async () => {
    const jobs = await runner()
    const payload = envelope()
    const result = await jobs.run(await sign(payload))
    expect(result.status).toBe("success")
    expect(result.jobId).toBe(payload.id)
    expect(result.output).toEqual({ ok: true, actionId: RENDER })
    expect(result.error).toBeUndefined()
  })

  test("DENIED: a tampered envelope is NOT_AUTHORIZED", async () => {
    const jobs = await runner()
    const signed = await sign(envelope())
    const tampered: SignedJob = { ...signed, payload: { ...signed.payload, input: { samples: 4096 } } }
    const result = await jobs.run(tampered)
    expect(result.status).toBe("error")
    expect(result.error?.code).toBe("NOT_AUTHORIZED")
    expect(result.jobId).toBe(signed.payload.id)
  })

  test("DENIED: a job signed with an unknown key id is NOT_AUTHORIZED", async () => {
    const jobs = await runner()
    const result = await jobs.run(await sign(envelope(), "k-attacker"))
    expect(result.error?.code).toBe("NOT_AUTHORIZED")
  })

  test("DENIED: an expired envelope is TIMEOUT", async () => {
    const jobs = await runner()
    const issuedAt = Date.now() - 120_000
    const result = await jobs.run(await sign(envelope({ issuedAt, expiresAt: issuedAt + 30_000 })))
    expect(result.status).toBe("error")
    expect(result.error?.code).toBe("TIMEOUT")
  })

  test("DENIED: an unsupported protocol version is INVALID_INPUT", async () => {
    const jobs = await runner()
    const result = await jobs.run(await sign(envelope({ protocolVersion: `${PROTOCOL_VERSION}99` })))
    expect(result.error?.code).toBe("INVALID_INPUT")
  })

  test("DENIED: a replayed job id is REPLAY_DETECTED", async () => {
    const jobs = await runner()
    const signed = await sign(envelope())
    expect((await jobs.run(signed)).status).toBe("success")
    const replayed = await jobs.run(signed)
    expect(replayed.status).toBe("error")
    expect(replayed.error?.code).toBe("REPLAY_DETECTED")
    expect(replayed.jobId).toBe(signed.payload.id)
  })

  test("DENIED: the local allowlist overrides the gateway's decision", async () => {
    const pythonAction = action({ id: "blender.python.execute", risk: "R0", requiredCapabilities: [] })
    const jobs = await runner({ actions: [pythonAction], capabilities: [] })
    const result = await jobs.run(await sign(envelope({ action: "blender.python.execute" })))
    expect(result.error?.code).toBe("NOT_AUTHORIZED")
  })

  test("DENIED: a user-disabled action never reaches the adapter", async () => {
    let called = false
    const jobs = await runner({
      disabledActions: [RENDER],
      execute: async () => {
        called = true
        return { output: null }
      },
    })
    const result = await jobs.run(await sign(envelope()))
    expect(result.error?.code).toBe("NOT_AUTHORIZED")
    expect(called).toBe(false)
  })

  test("DENIED: an action no registered adapter declares", async () => {
    const jobs = await runner()
    const result = await jobs.run(await sign(envelope({ action: "blender.object.delete" })))
    expect(result.error?.code).toBe("NOT_AUTHORIZED")
  })

  test("an adapter error becomes a structured result, never a rejection", async () => {
    const jobs = await runner({
      execute: async () => {
        throw new GatewayError("CAPABILITY_UNAVAILABLE", "Blender is not running.")
      },
    })
    const result = await jobs.run(await sign(envelope()))
    expect(result.status).toBe("error")
    expect(result.error).toEqual({ code: "CAPABILITY_UNAVAILABLE", message: "Blender is not running." })
  })

  test("a non-Error rejection is normalized instead of killing the session", async () => {
    const jobs = await runner({
      execute: async () => {
        throw "boom"
      },
    })
    const result = await jobs.run(await sign(envelope()))
    expect(result.error?.code).toBe("INTERNAL")
  })

  test("a local path in an adapter message is stripped out of the result", async () => {
    const jobs = await runner({
      execute: async () => {
        throw new GatewayError("UPSTREAM_ERROR", "cannot write /home/operator/secret/render.png")
      },
    })
    const result = await jobs.run(await sign(envelope()))
    expect(result.error?.message).not.toContain("/home/operator")
    expect(result.error?.message).toContain("[path]")
  })

  test("an adapter that ignores its signal still times out", async () => {
    const jobs = await runner({
      timeoutMs: 20,
      execute: () => new Promise<AdapterOutput>(() => {}),
    })
    const result = await jobs.run(await sign(envelope()))
    expect(result.error?.code).toBe("TIMEOUT")
    expect(jobs.inflight()).toBe(0)
  })

  test("cancel aborts an in-flight job and reports CANCELLED", async () => {
    const jobs = await runner({
      execute: (_actionId, _input, signal) =>
        new Promise<AdapterOutput>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")))
        }),
    })
    const payload = envelope()
    const pending = jobs.run(await sign(payload))
    await waitFor(() => jobs.inflight() === 1)
    expect(jobs.cancel(payload.id)).toBe(true)
    const result = await pending
    expect(result.error?.code).toBe("CANCELLED")
    expect(jobs.cancel(payload.id)).toBe(false)
  })

  test("a frame with no usable job id still produces a correlatable error result", async () => {
    const jobs = await runner()
    const result = await jobs.run({ payload: undefined, signature: "x", keyId: "k1" } as unknown as SignedJob)
    expect(result.jobId).toBe(UNKNOWN_JOB_ID)
    expect(result.status).toBe("error")
  })

  test("timings are non-negative integers", async () => {
    const jobs = await runner()
    const result = await jobs.run(await sign(envelope()))
    expect(Number.isInteger(result.timingMs)).toBe(true)
    expect(result.timingMs).toBeGreaterThanOrEqual(0)
  })
})
