import { describe, expect, test } from "bun:test"
import { open, seal } from "@cg/auth"
import type { AgentResult, SignedJob } from "@cg/protocol"
import type { Dispatcher } from "./dispatch"
import { handlePeerDispatch } from "./peer-handler"
import { signPeerRequest } from "./peer-auth"
import { createSocketRegistry } from "./sockets"
import type { RelaySocket } from "./types"

const KEY = Buffer.alloc(32, 9).toString("base64")
const SERVICE = "service-token-for-peer-tests"
const JOB: SignedJob = {
  payload: { id: "job_peer1", protocolVersion: "1", issuedAt: Date.now(), expiresAt: Date.now() + 30_000, connector: "blender", action: "scene.render", input: { frame: 1 }, requestContext: { requestId: "req_peer1", userId: "user_peer1" }, nonce: "nce_peer1" },
  signature: "signature_peer1",
  keyId: "k1",
}
const RESULT: AgentResult = { jobId: "job_peer1", status: "success", output: { rendered: true }, timingMs: 4 }

function setup() {
  const sockets = createSocketRegistry()
  const socket = { data: { socketId: "nce_session1111111111", deviceId: "dev_peer1", authenticated: true, lastSeenAt: Date.now(), presenceAt: Date.now(), helloTimer: null } } as unknown as RelaySocket
  sockets.set("dev_peer1", socket)
  let calls = 0
  const dispatcher: Dispatcher = {
    dispatch: async (_deviceId, job) => { calls += 1; expect(job.payload.id).toBe(JOB.payload.id); return RESULT },
    settle: () => false,
    failDevice: () => 0,
    pendingCount: () => 0,
  }
  return { sockets, dispatcher, calls: () => calls }
}

async function request(token = SERVICE, sessionId = "nce_session1111111111") {
  const body = JSON.stringify({ deviceId: "dev_peer1", sessionId, payloadCipher: await seal(JSON.stringify(JOB), KEY), timeoutMs: 1000 })
  const auth = signPeerRequest(token, body)
  return new Request("http://10.0.0.3:8787/internal/relay/dispatch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cg-peer-timestamp": auth.timestamp,
      "x-cg-peer-nonce": auth.nonce,
      "x-cg-peer-signature": auth.signature,
    },
    body,
  })
}

describe("internal relay peer handler", () => {
  test("authenticates, session-binds, decrypts and re-seals a device result", async () => {
    const env = setup()
    const response = await handlePeerDispatch(await request(), { serviceToken: SERVICE, encryptionKey: KEY, sockets: env.sockets, dispatcher: env.dispatcher })
    expect(response.status).toBe(200)
    const body = await response.json() as { ok: boolean; resultCipher: string }
    expect(body.ok).toBe(true)
    expect(JSON.parse(await open(body.resultCipher, KEY))).toEqual(RESULT)
    expect(env.calls()).toBe(1)
  })

  test("rejects the wrong service bearer before decrypting", async () => {
    const env = setup()
    const response = await handlePeerDispatch(await request("wrong-service-token-value"), { serviceToken: SERVICE, encryptionKey: KEY, sockets: env.sockets, dispatcher: env.dispatcher })
    expect(response.status).toBe(401)
    expect(env.calls()).toBe(0)
  })

  test("a stale route session cannot deliver to a replacement socket", async () => {
    const env = setup()
    const response = await handlePeerDispatch(await request(SERVICE, "nce_oldsession11111111"), { serviceToken: SERVICE, encryptionKey: KEY, sockets: env.sockets, dispatcher: env.dispatcher })
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false, errorCode: "DEVICE_OFFLINE" })
    expect(env.calls()).toBe(0)
  })
})
