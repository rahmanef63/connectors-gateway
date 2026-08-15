import { describe, expect, test } from "bun:test"
import type { ConnectionCredential } from "@cg/core"
import { createCloudExecutor } from "./cloud"
import { fakeConnections, makeManifest, makeRequest } from "./__tests__/fixtures"
import type { CloudAdapter, CloudAdapterContext } from "./types"

const CIPHER = "cipher:sk-live-supersecret"
const PLAINTEXT = "sk-live-supersecret"

const stored: ConnectionCredential = {
  connectionId: "conn_1",
  baseUrl: "https://api.careerpack.test",
  token: CIPHER,
}

const openCredential = (tokenCipher: string): string => tokenCipher.replace("cipher:", "")

function adapter(
  execute: CloudAdapter["execute"],
  connectorId = "careerpack",
): Map<string, CloudAdapter> {
  return new Map([[connectorId, { manifest: makeManifest("cloud", { id: connectorId }), execute }]])
}

describe("createCloudExecutor", () => {
  test("opens the stored credential and hands it only to the adapter", async () => {
    let seen: CloudAdapterContext | undefined
    const executor = createCloudExecutor({
      adapters: adapter(async (_actionId, _input, context) => {
        seen = context
        return { output: { ok: true } }
      }),
      connections: fakeConnections(stored),
      openCredential,
    })

    const result = await executor.execute(makeRequest("cloud"))

    expect(result.status).toBe("success")
    expect(result.output).toEqual({ ok: true })
    expect(seen?.credential.token).toBe(PLAINTEXT)
    expect(seen?.requestId).toBe("req_test")
    expect(JSON.stringify(result)).not.toContain(PLAINTEXT)
    expect(JSON.stringify(result)).not.toContain(CIPHER)
  })

  test("DENIED: no adapter registered -> CONNECTOR_NOT_FOUND", async () => {
    const executor = createCloudExecutor({
      adapters: new Map(),
      connections: fakeConnections(stored),
      openCredential,
    })

    const result = await executor.execute(makeRequest("cloud"))
    expect(result.status).toBe("error")
    expect(result.error?.code).toBe("CONNECTOR_NOT_FOUND")
  })

  test("DENIED: no stored connection -> CONNECTION_MISSING", async () => {
    let called = false
    const executor = createCloudExecutor({
      adapters: adapter(async () => {
        called = true
        return { output: null }
      }),
      connections: fakeConnections(null),
      openCredential,
    })

    const result = await executor.execute(makeRequest("cloud"))

    expect(result.status).toBe("error")
    expect(result.error?.code).toBe("CONNECTION_MISSING")
    expect(called).toBe(false)
  })

  test("DENIED: an unusable decrypted credential -> CONNECTION_MISSING", async () => {
    const executor = createCloudExecutor({
      adapters: adapter(async () => ({ output: null })),
      connections: fakeConnections(stored),
      openCredential: () => "",
    })

    const result = await executor.execute(makeRequest("cloud"))
    expect(result.error?.code).toBe("CONNECTION_MISSING")
  })

  test("a thrown adapter error becomes UPSTREAM_ERROR without the token", async () => {
    const executor = createCloudExecutor({
      adapters: adapter(async (_actionId, _input, context) => {
        throw new Error(
          `401 from https://api.careerpack.test with Authorization: Bearer ${context.credential.token} (see /home/user/logs/upstream.log)`,
        )
      }),
      connections: fakeConnections(stored),
      openCredential,
    })

    const result = await executor.execute(makeRequest("cloud"))

    expect(result.status).toBe("error")
    expect(result.error?.code).toBe("UPSTREAM_ERROR")
    expect(result.error?.message).not.toContain(PLAINTEXT)
    expect(result.error?.message).not.toContain(CIPHER)
    expect(result.error?.message).not.toContain("/home/user")
    expect(JSON.stringify(result)).not.toContain(PLAINTEXT)
  })

  test("an exhausted budget becomes TIMEOUT", async () => {
    const executor = createCloudExecutor({
      adapters: adapter(
        (_actionId, _input, context) =>
          new Promise((_resolve, reject) => {
            context.signal.addEventListener("abort", () => reject(context.signal.reason))
          }),
      ),
      connections: fakeConnections(stored),
      openCredential,
    })

    const result = await executor.execute(makeRequest("cloud", { timeoutMs: 5 }))

    expect(result.status).toBe("error")
    expect(result.error?.code).toBe("TIMEOUT")
    expect(result.timingMs).toBeGreaterThanOrEqual(0)
  })

  test("an adapter that swallows the abort still reports TIMEOUT", async () => {
    const executor = createCloudExecutor({
      adapters: adapter(
        (_actionId, _input, context) =>
          new Promise((_resolve, reject) => {
            context.signal.addEventListener("abort", () => reject(new Error("socket closed")))
          }),
      ),
      connections: fakeConnections(stored),
      openCredential,
    })

    const result = await executor.execute(makeRequest("cloud", { timeoutMs: 5 }))
    expect(result.error?.code).toBe("TIMEOUT")
  })

  test("DENIED: a malformed adapter response -> UPSTREAM_ERROR", async () => {
    const executor = createCloudExecutor({
      adapters: adapter(async () => "not an object" as unknown as { output: unknown }),
      connections: fakeConnections(stored),
      openCredential,
    })

    const result = await executor.execute(makeRequest("cloud"))
    expect(result.error?.code).toBe("UPSTREAM_ERROR")
  })

  test("scrubs absolute paths out of returned file metadata", async () => {
    const executor = createCloudExecutor({
      adapters: adapter(async () => ({
        output: { ok: true },
        files: [
          {
            name: "/home/user/renders/frame.png",
            mimeType: "image/png",
            sizeBytes: 10,
            ref: "file_abc",
          },
        ],
      })),
      connections: fakeConnections(stored),
      openCredential,
    })

    const result = await executor.execute(makeRequest("cloud"))
    expect(result.files?.[0]?.name).toBe("frame.png")
    expect(JSON.stringify(result)).not.toContain("/home/user")
  })
})
