import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { CloudAdapterContext } from "@cg/sdk"
import { careerpackAdapter } from "./adapter"
import { ACTION_APPLICATION_CREATE, ACTION_PROFILE_READ } from "./manifest"

const TOKEN = "cp_live_9c2f4a1b7e6d8f3a5b0c1d2e3f4a5b6c"
const BASE_URL = "https://careerpack.example.com/mcp"

const originalFetch = globalThis.fetch
type StubCall = { url: string; init: RequestInit }
let calls: StubCall[] = []

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

function rpc(result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, result })
}

function context(signal: AbortSignal = new AbortController().signal): CloudAdapterContext {
  return {
    requestId: "req_test",
    credential: { connectionId: "conn_test", baseUrl: BASE_URL, token: TOKEN },
    signal,
  }
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("careerpackAdapter happy paths", () => {
  test("returns structuredContent when present", async () => {
    stubFetch(rpc({ structuredContent: { headline: "Backend engineer" }, content: [{ type: "text", text: "ignored" }] }))

    const result = await careerpackAdapter.execute(ACTION_PROFILE_READ, {}, context())

    expect(result.output).toEqual({ headline: "Backend engineer" })
  })

  test("falls back to the first text content block parsed as JSON", async () => {
    stubFetch(rpc({ content: [{ type: "image", data: "x" }, { type: "text", text: '{"applicationId":"app_1"}' }] }))

    const result = await careerpackAdapter.execute(
      ACTION_APPLICATION_CREATE,
      { role: "Backend engineer", company: "Acme", status: "applied" },
      context(),
    )

    expect(result.output).toEqual({ applicationId: "app_1" })
  })

  test("falls back to raw text when the text block is not JSON", async () => {
    stubFetch(rpc({ content: [{ type: "text", text: "application created" }] }))

    const result = await careerpackAdapter.execute(
      ACTION_APPLICATION_CREATE,
      { role: "Backend engineer", company: "Acme" },
      context(),
    )

    expect(result.output).toBe("application created")
  })

  test("maps the action onto the upstream tool name and sends MCP headers", async () => {
    stubFetch(rpc({ structuredContent: {} }))

    await careerpackAdapter.execute(ACTION_APPLICATION_CREATE, { role: "SRE", company: "Acme", notes: "referred" }, context())

    const call = calls[0]
    expect(call).toBeDefined()
    const headers = call?.init.headers as Record<string, string>
    expect(headers["Authorization"]).toBe(`Bearer ${TOKEN}`)
    expect(headers["Content-Type"]).toBe("application/json")
    expect(headers["Accept"]).toBe("application/json, text/event-stream")
    expect(headers["MCP-Protocol-Version"]).toBeString()

    const body = JSON.parse(String(call?.init.body)) as Record<string, unknown>
    expect(body["jsonrpc"]).toBe("2.0")
    expect(body["method"]).toBe("tools/call")
    expect(body["params"]).toEqual({
      name: "create_application",
      arguments: { role: "SRE", company: "Acme", notes: "referred" },
    })
  })
})

describe("careerpackAdapter failure paths", () => {
  test("a JSON-RPC error becomes UPSTREAM_ERROR", async () => {
    stubFetch(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "unknown argument" } }))

    const error = await careerpackAdapter.execute(ACTION_PROFILE_READ, {}, context()).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
    expect((error as GatewayError).message).toContain("unknown argument")
  })

  test("result.isError becomes UPSTREAM_ERROR", async () => {
    stubFetch(rpc({ isError: true, content: [{ type: "text", text: "profile is locked" }] }))

    const error = await careerpackAdapter.execute(ACTION_PROFILE_READ, {}, context()).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
    expect((error as GatewayError).message).toContain("profile is locked")
  })

  test("an unknown action id is ACTION_NOT_FOUND and never reaches the network", async () => {
    stubFetch(rpc({ structuredContent: {} }))

    const error = await careerpackAdapter
      .execute("careerpack.profile.delete", {}, context())
      .catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).code).toBe("ACTION_NOT_FOUND")
    expect(calls).toHaveLength(0)
  })

  test("invalid input is rejected before the network call", async () => {
    stubFetch(rpc({ structuredContent: {} }))

    const error = await careerpackAdapter
      .execute(ACTION_APPLICATION_CREATE, { company: "Acme" }, context())
      .catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("INVALID_INPUT")
    expect(calls).toHaveLength(0)
  })

  test("a missing credential is CONNECTION_MISSING", async () => {
    stubFetch(rpc({ structuredContent: {} }))

    const error = await careerpackAdapter
      .execute(ACTION_PROFILE_READ, {}, {
        requestId: "req_test",
        credential: { connectionId: "conn_test", baseUrl: BASE_URL, token: "" },
        signal: new AbortController().signal,
      })
      .catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("CONNECTION_MISSING")
    expect(calls).toHaveLength(0)
  })

  test("output echoing the credential is discarded", async () => {
    stubFetch(rpc({ structuredContent: { debug: `Bearer ${TOKEN}` } }))

    const error = await careerpackAdapter.execute(ACTION_PROFILE_READ, {}, context()).catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
    expect((error as GatewayError).message).not.toContain(TOKEN)
  })
})

describe("careerpackAdapter cancellation", () => {
  test("the caller's AbortSignal is handed to fetch", async () => {
    stubFetch(rpc({ structuredContent: {} }))
    const controller = new AbortController()

    await careerpackAdapter.execute(ACTION_PROFILE_READ, {}, context(controller.signal))

    expect(calls[0]?.init.signal).toBe(controller.signal)
  })

  test("an already-aborted signal short-circuits to CANCELLED", async () => {
    stubFetch(rpc({ structuredContent: {} }))
    const controller = new AbortController()
    controller.abort()

    const error = await careerpackAdapter
      .execute(ACTION_PROFILE_READ, {}, context(controller.signal))
      .catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("CANCELLED")
    expect(calls).toHaveLength(0)
  })
})

describe("the bearer token never leaks", () => {
  const failures: { name: string; body: string; status?: number }[] = [
    {
      name: "json-rpc error echoing the header",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32001, message: `invalid credential: Bearer ${TOKEN} (header authorization=${TOKEN})` },
      }),
    },
    {
      name: "isError result echoing the token",
      body: rpc({ isError: true, content: [{ type: "text", text: `token ${TOKEN} is expired` }] }),
    },
    { name: "http failure echoing the token", body: `unauthorized: ${TOKEN}`, status: 401 },
    { name: "malformed body echoing the token", body: `<html>${TOKEN}</html>` },
    { name: "output echoing the token", body: rpc({ structuredContent: { seen: TOKEN } }) },
  ]

  for (const failure of failures) {
    test(`${failure.name} produces no token in the error or the output`, async () => {
      const options = failure.status === undefined ? {} : { status: failure.status }
      stubFetch(failure.body, options)

      let thrown: unknown
      let output: unknown
      try {
        output = (await careerpackAdapter.execute(ACTION_PROFILE_READ, {}, context())).output
      } catch (cause) {
        thrown = cause
      }

      expect(thrown).toBeInstanceOf(GatewayError)
      const error = thrown as GatewayError
      expect(error.message).not.toContain(TOKEN)
      expect(JSON.stringify(error.toJSON())).not.toContain(TOKEN)
      expect(JSON.stringify(output ?? null)).not.toContain(TOKEN)
    })
  }
})
