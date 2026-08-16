import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { ConnectorManifest } from "@cg/core"
import type { CloudAdapterContext } from "@cg/sdk"
import { createRemoteMcpAdapter } from "./adapter"

/**
 * Deliberately NOT the CareerPack manifest. The adapter is the generic type; if this file
 * needed a real connector's data to exercise it, the collapse would not have worked.
 * The shipped connectors are covered as data in ./connectors.test.ts.
 */
const READ = "fixture.thing.read"
const WRITE = "fixture.thing.create"

function fixtureManifest(overrides: Partial<ConnectorManifest> = {}): ConnectorManifest {
  return {
    id: "fixture",
    name: "Fixture",
    version: "0.1.0",
    executor: "cloud",
    auth: { type: "bearer" },
    actions: [
      {
        id: READ,
        title: "Read a thing",
        description: "Read a thing.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        risk: "R0",
        annotations: { readOnly: true, destructive: false, idempotent: true },
        "x-upstream": "thing_get",
      },
      {
        id: WRITE,
        title: "Create a thing",
        description: "Create a thing.",
        inputSchema: { type: "object", additionalProperties: true },
        risk: "R1",
        annotations: { readOnly: false, destructive: false },
        "x-upstream": "things_create",
      },
    ],
    ...overrides,
  } as ConnectorManifest
}

const adapter = createRemoteMcpAdapter(fixtureManifest())

const TOKEN = "cp_live_9c2f4a1b7e6d8f3a5b0c1d2e3f4a5b6c"
const BASE_URL = "https://upstream.example.com/mcp"

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

describe("createRemoteMcpAdapter construction", () => {
  test("keeps the manifest it was built from", () => {
    expect(adapter.manifest.id).toBe("fixture")
  })

  /**
   * A `local` manifest routed here would leave the device relay and call the public
   * internet. Users author manifests in docs/16 step 3, so `executor` is untrusted.
   */
  test("refuses a manifest that is not a cloud connector", () => {
    let thrown: unknown
    try {
      createRemoteMcpAdapter(fixtureManifest({ executor: "local" }))
    } catch (cause) {
      thrown = cause
    }
    expect(thrown).toBeInstanceOf(GatewayError)
    expect((thrown as GatewayError).code).toBe("INVALID_INPUT")
  })
})

describe("remote-mcp adapter happy paths", () => {
  test("returns structuredContent when present", async () => {
    stubFetch(
      rpc({ structuredContent: { headline: "Backend engineer" }, content: [{ type: "text", text: "ignored" }] }),
    )

    const result = await adapter.execute(READ, {}, context())

    expect(result.output).toEqual({ headline: "Backend engineer" })
  })

  test("falls back to the first text content block parsed as JSON", async () => {
    stubFetch(rpc({ content: [{ type: "image", data: "x" }, { type: "text", text: '{"id":"app_1"}' }] }))

    const result = await adapter.execute(WRITE, { company: "Acme" }, context())

    expect(result.output).toEqual({ id: "app_1" })
  })

  test("falls back to raw text when the text block is not JSON", async () => {
    stubFetch(rpc({ content: [{ type: "text", text: "thing created" }] }))

    const result = await adapter.execute(WRITE, { company: "Acme" }, context())

    expect(result.output).toBe("thing created")
  })

  test("maps the action onto the manifest's x-upstream name and sends MCP headers", async () => {
    stubFetch(rpc({ structuredContent: {} }))

    await adapter.execute(WRITE, { company: "Acme", notes: "referred" }, context())

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
      name: "things_create",
      arguments: { company: "Acme", notes: "referred" },
    })
  })
})

describe("remote-mcp adapter failure paths", () => {
  test("a JSON-RPC error becomes UPSTREAM_ERROR", async () => {
    stubFetch(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "unknown argument" } }))

    const error = await adapter.execute(READ, {}, context()).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
    expect((error as GatewayError).message).toContain("unknown argument")
  })

  test("result.isError becomes UPSTREAM_ERROR", async () => {
    stubFetch(rpc({ isError: true, content: [{ type: "text", text: "profile is locked" }] }))

    const error = await adapter.execute(READ, {}, context()).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
    expect((error as GatewayError).message).toContain("profile is locked")
  })

  test("an unknown action id is ACTION_NOT_FOUND and never reaches the network", async () => {
    stubFetch(rpc({ structuredContent: {} }))

    const error = await adapter.execute("fixture.thing.delete", {}, context()).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).code).toBe("ACTION_NOT_FOUND")
    expect(calls).toHaveLength(0)
  })

  /**
   * The denied case that matters most for the collapse: an action the manifest declares
   * but gives no `x-upstream`. Guessing `thing_get` from the id would have called a real
   * upstream tool the manifest never described.
   */
  test("a declared action with no x-upstream is ACTION_NOT_FOUND, not a guess", async () => {
    stubFetch(rpc({ structuredContent: {} }))
    const manifest = fixtureManifest()
    const actions = manifest.actions.map((action) => {
      const copy = { ...action } as Record<string, unknown>
      delete copy["x-upstream"]
      return copy
    })
    const unmapped = createRemoteMcpAdapter({ ...manifest, actions } as unknown as ConnectorManifest)

    const error = await unmapped.execute(READ, {}, context()).catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("ACTION_NOT_FOUND")
    expect(calls).toHaveLength(0)
  })

  /**
   * Schema validation is the pipeline's job (execute.ts step 3) and is deliberately not
   * repeated here — two copies of one schema drift. What the adapter still owes is a
   * shape narrowing, because JSON-RPC `arguments` must be an object.
   */
  test("a non-object input is rejected before the network call", async () => {
    stubFetch(rpc({ structuredContent: {} }))

    for (const input of ["everything", ["everything"], 42]) {
      const error = await adapter.execute(WRITE, input, context()).catch((cause: unknown) => cause)

      expect((error as GatewayError).code).toBe("INVALID_INPUT")
    }
    expect(calls).toHaveLength(0)
  })

  test("a validated payload is forwarded verbatim, not re-shaped", async () => {
    stubFetch(rpc({ structuredContent: { application_id: "app_1" } }))
    const input = {
      company: "Acme",
      position: "SRE",
      location: "Jakarta",
      source: "LinkedIn",
      salary: "10-15 juta",
      notes: "referred",
      status: "screening",
      cv_id: "cv_123",
    }

    await adapter.execute(WRITE, input, context())

    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, Record<string, unknown>>
    expect(body["params"]?.["arguments"]).toEqual(input)
  })

  test("a missing credential is CONNECTION_MISSING", async () => {
    stubFetch(rpc({ structuredContent: {} }))

    const error = await adapter
      .execute(READ, {}, {
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

    const error = await adapter.execute(READ, {}, context()).catch((cause: unknown) => cause)

    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
    expect((error as GatewayError).message).not.toContain(TOKEN)
  })
})

describe("remote-mcp adapter cancellation", () => {
  test("the caller's AbortSignal is handed to fetch", async () => {
    stubFetch(rpc({ structuredContent: {} }))
    const controller = new AbortController()

    await adapter.execute(READ, {}, context(controller.signal))

    expect(calls[0]?.init.signal).toBe(controller.signal)
  })

  test("an already-aborted signal short-circuits to CANCELLED", async () => {
    stubFetch(rpc({ structuredContent: {} }))
    const controller = new AbortController()
    controller.abort()

    const error = await adapter.execute(READ, {}, context(controller.signal)).catch((cause: unknown) => cause)

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
        output = (await adapter.execute(READ, {}, context())).output
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
