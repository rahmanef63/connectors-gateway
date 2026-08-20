import { describe, expect, test } from "bun:test"
import type { AgentResult, SignedJob } from "@cg/protocol"
import { createRoutedDispatcher } from "./routed-dispatch"
import type { Dispatcher } from "./dispatch"
import type { RelayRouteStore } from "../store/relay-routes"

const job = { payload: { id: "job_1", protocolVersion: "1", issuedAt: 1, expiresAt: 9999999999999, connector: "blender", action: "scene.render", input: {}, requestContext: { requestId: "req_1", userId: "user_1" }, nonce: "nce_1" }, signature: "sig_123", keyId: "k1" } as SignedJob
const result: AgentResult = { jobId: "job_1", status: "success", output: { ok: true }, timingMs: 1 }
const key = () => Buffer.alloc(32, 7).toString("base64")
const localDispatcher = (fn: () => Promise<AgentResult>): Dispatcher => ({ dispatch: fn, settle: () => false, failDevice: () => 0, pendingCount: () => 0 })

function routes(value: any): RelayRouteStore {
  return { resolve: async () => value, claim: async () => true, refresh: async () => true, release: async () => true }
}

describe("routed dispatcher", () => {
  test("keeps a same-instance device on the direct local dispatcher", async () => {
    let local = 0
    const dispatcher = createRoutedDispatcher({
      gatewayId: "gw_local1111111111", serviceToken: "service-token", encryptionKey: key(),
      routes: routes({ gatewayId: "gw_local1111111111", sessionId: "nce_session1111111111", internalUrl: "http://10.0.0.2:8787", expiresAt: Date.now()+1000 }),
      local: localDispatcher(async () => { local++; return result }),
      fetcher: async () => { throw new Error("must not fetch") },
    })
    expect(await dispatcher.dispatch("dev_1", job, 1000)).toEqual(result)
    expect(local).toBe(1)
  })

  test("cross-instance traffic is sealed and a valid sealed result is opened", async () => {
    const encryptionKey = key()
    const { seal } = await import("@cg/auth")
    let body = ""
    const dispatcher = createRoutedDispatcher({
      gatewayId: "gw_origin111111111", serviceToken: "service-token", encryptionKey,
      routes: routes({ gatewayId: "gw_owner1111111111", sessionId: "nce_session1111111111", internalUrl: "http://10.0.0.3:8787", expiresAt: Date.now()+1000 }),
      local: {} as Dispatcher,
      fetcher: async (_input, init) => {
        body = String(init?.body ?? "")
        return new Response(JSON.stringify({ ok: true, resultCipher: await seal(JSON.stringify(result), encryptionKey) }))
      },
    })
    expect(await dispatcher.dispatch("dev_1", job, 1000)).toEqual(result)
    expect(body).not.toContain("scene.render")
    expect(body).not.toContain("user_1")
  })

  test("an ambiguous peer transport failure is never replayed", async () => {
    let calls = 0
    const dispatcher = createRoutedDispatcher({
      gatewayId: "gw_origin111111111", serviceToken: "service-token", encryptionKey: key(),
      routes: routes({ gatewayId: "gw_owner1111111111", sessionId: "nce_session1111111111", internalUrl: "http://10.0.0.3:8787", expiresAt: Date.now()+1000 }),
      local: {} as Dispatcher,
      fetcher: async () => { calls++; throw new Error("connection reset") },
    })
    await expect(dispatcher.dispatch("dev_1", job, 1000)).rejects.toMatchObject({ code: "UPSTREAM_ERROR" })
    expect(calls).toBe(1)
  })
})
