import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { MCP_PROTOCOL_VERSION, callTool } from "./mcp-client"

const TOKEN = "cp_live_9c2f4a1b7e6d8f3a5b0c1d2e3f4a5b6c"
const BASE_URL = "https://careerpack.example.com/mcp"

const originalFetch = globalThis.fetch
let calls: { url: string; init: RequestInit }[] = []

function stubFetch(body: string, options: { status?: number; contentType?: string } = {}): void {
  globalThis.fetch = ((input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return Promise.resolve(
      new Response(body, {
        status: options.status ?? 200,
        headers: { "content-type": options.contentType ?? "application/json" },
      }),
    )
  }) as unknown as typeof fetch
}

function stubReject(error: Error): void {
  globalThis.fetch = (() => Promise.reject(error)) as unknown as typeof fetch
}

function rpc(result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, result })
}

function call(baseUrl = BASE_URL, signal = new AbortController().signal): Promise<unknown> {
  return callTool(baseUrl, TOKEN, "get_profile", {}, signal)
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("callTool transport", () => {
  test("posts a JSON-RPC 2.0 tools/call with the MCP headers", async () => {
    stubFetch(rpc({ structuredContent: { ok: true } }))

    await call()

    const sent = calls[0]
    expect(sent?.url).toBe(BASE_URL)
    expect(sent?.init.method).toBe("POST")
    expect((sent?.init.headers as Record<string, string>)["MCP-Protocol-Version"]).toBe(MCP_PROTOCOL_VERSION)
    const body = JSON.parse(String(sent?.init.body)) as Record<string, unknown>
    expect(body["jsonrpc"]).toBe("2.0")
    expect(typeof body["id"]).toBe("number")
    expect(body["method"]).toBe("tools/call")
  })

  test("rejects a non-loopback plaintext endpoint", async () => {
    stubFetch(rpc({ structuredContent: {} }))

    const error = await call("http://careerpack.example.com/mcp").catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
    expect(calls).toHaveLength(0)
  })

  test("allows a loopback plaintext endpoint for local development", async () => {
    stubFetch(rpc({ structuredContent: { ok: true } }))

    await expect(call("http://127.0.0.1:8787/mcp")).resolves.toEqual({ ok: true })
  })

  test("rejects an unparseable endpoint", async () => {
    stubFetch(rpc({ structuredContent: {} }))

    const error = await call("not-a-url").catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
  })

  test("a non-2xx response is UPSTREAM_ERROR carrying only the status", async () => {
    stubFetch(`unauthorized ${TOKEN}`, { status: 401 })

    const error = await call().catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
    expect((error as GatewayError).message).toContain("401")
    expect((error as GatewayError).message).not.toContain(TOKEN)
  })

  test("an AbortError from fetch maps to CANCELLED", async () => {
    const abort = new Error("aborted")
    abort.name = "AbortError"
    stubReject(abort)

    const error = await call().catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("CANCELLED")
  })

  test("a TimeoutError from fetch maps to TIMEOUT", async () => {
    const timeout = new Error("timed out")
    timeout.name = "TimeoutError"
    stubReject(timeout)

    const error = await call().catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("TIMEOUT")
  })

  test("any other network failure maps to UPSTREAM_ERROR without the cause message", async () => {
    stubReject(new Error(`ECONNREFUSED while sending Bearer ${TOKEN}`))

    const error = await call().catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
    expect((error as GatewayError).message).not.toContain(TOKEN)
  })
})

describe("callTool response parsing", () => {
  test("reads an SSE framed response", async () => {
    const body = `event: message\ndata: ${rpc({ structuredContent: { headline: "SRE" } })}\n\n`
    stubFetch(body, { contentType: "text/event-stream" })

    await expect(call()).resolves.toEqual({ headline: "SRE" })
  })

  test("returns null when the result carries no content", async () => {
    stubFetch(rpc({ content: [] }))

    await expect(call()).resolves.toBeNull()
  })

  test("a malformed body is UPSTREAM_ERROR", async () => {
    stubFetch("<html>nope</html>")

    const error = await call().catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
  })

  test("an empty body is UPSTREAM_ERROR", async () => {
    stubFetch("   ")

    const error = await call().catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
  })

  test("a response without a result object is UPSTREAM_ERROR", async () => {
    stubFetch(JSON.stringify({ jsonrpc: "2.0", id: 1 }))

    const error = await call().catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
  })

  test("a pre-aborted signal never reaches the network", async () => {
    stubFetch(rpc({ structuredContent: {} }))
    const controller = new AbortController()
    controller.abort()

    const error = await call(BASE_URL, controller.signal).catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("CANCELLED")
    expect(calls).toHaveLength(0)
  })
})
