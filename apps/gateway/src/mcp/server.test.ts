import { describe, expect, test } from "bun:test"
import { fakeApiKeys, mcpDeps, scope, testApiKey, TEST_CONNECTOR } from "../__tests__/fixtures"
import {
  handleMcpRequest,
  MCP_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSIONS,
  negotiateProtocolVersion,
  toToolResult,
} from "./server"

function rpc(method: string, params: Record<string, unknown> = {}, id: number | string = 1) {
  return { jsonrpc: "2.0", id, method, params }
}

async function call(body: unknown, tokenOverride?: string | null) {
  const deps = await mcpDeps()
  const { token } = await testApiKey()
  const outcome = await handleMcpRequest(deps, {
    scope: scope(),
    token: tokenOverride === undefined ? token : tokenOverride,
    body,
  })
  return { deps, outcome }
}

describe("handleMcpRequest — authentication", () => {
  test("a missing token is 401 before the body is even parsed", async () => {
    const { outcome } = await call({ garbage: true }, null)
    expect(outcome.status).toBe(401)
    expect(outcome.body?.error).toMatchObject({ message: "Unauthorized." })
  })

  test("an unknown key is 401", async () => {
    const deps = await mcpDeps({ apiKeys: fakeApiKeys(null) })
    const { token } = await testApiKey()
    const outcome = await handleMcpRequest(deps, { scope: scope(), token, body: rpc("ping") })
    expect(outcome.status).toBe(401)
  })
})

describe("handleMcpRequest — methods", () => {
  test("initialize advertises the protocol version and tool capability", async () => {
    const { outcome } = await call(rpc("initialize"))
    expect(outcome.status).toBe(200)
    expect(outcome.body?.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
    })
  })

  test("initialize echoes a revision the client asked for and we speak", async () => {
    // The point of negotiating: a 2024-11-05 client stays on 2024-11-05 instead
    // of being handed a newer number it never asked for.
    const { outcome } = await call(rpc("initialize", { protocolVersion: "2024-11-05" }))
    expect(outcome.body?.result).toMatchObject({ protocolVersion: "2024-11-05" })
  })

  test("ping answers with an empty result", async () => {
    const { outcome } = await call(rpc("ping"))
    expect(outcome.body?.result).toEqual({})
  })

  test("a notification gets no body", async () => {
    const { outcome } = await call({ jsonrpc: "2.0", method: "notifications/initialized" })
    expect(outcome.status).toBe(202)
    expect(outcome.body).toBeUndefined()
  })

  test("an unknown method is a JSON-RPC method-not-found", async () => {
    const { outcome } = await call(rpc("tools/delete"))
    expect(outcome.body?.error).toMatchObject({ code: -32601 })
  })

  test("a malformed envelope is 400 and never a 200 result", async () => {
    const { outcome } = await call({ jsonrpc: "1.0", method: "ping" })
    expect(outcome.status).toBe(400)
  })

  test("tools/list exposes the caller's catalog with faithful annotations", async () => {
    const { outcome } = await call(rpc("tools/list"))
    const tools = (outcome.body?.result as { tools: Record<string, unknown>[] }).tools
    const names = tools.map((tool) => tool.name)
    expect(names).toContain("testcloud_echo")
    // The local connector has no online device, so it is not in the catalog.
    expect(names.every((name) => !String(name).startsWith("testlocal"))).toBe(true)

    const echo = tools.find((tool) => tool.name === "testcloud_echo")
    expect(echo?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
  })
})

describe("handleMcpRequest — tools/call", () => {
  test("executes a catalogued tool and returns structured content", async () => {
    const { deps, outcome } = await call(
      rpc("tools/call", { name: "testcloud_echo", arguments: { keep: "yes" } }),
    )
    expect(outcome.body?.result).toMatchObject({
      isError: false,
      structuredContent: { ok: true },
    })
    expect(deps.executor.requests[0]?.connector.id).toBe(TEST_CONNECTOR)
    expect(deps.audit.events).toHaveLength(1)
  })

  test("an unknown tool name never reaches the pipeline", async () => {
    const { deps, outcome } = await call(rpc("tools/call", { name: "testcloud_python_execute" }))
    expect(outcome.body?.error).toMatchObject({ code: -32601 })
    expect(deps.executor.requests).toHaveLength(0)
    expect(deps.audit.events).toHaveLength(0)
  })

  test("a denied action comes back as a tool RESULT, not a transport error", async () => {
    const { outcome } = await call(rpc("tools/call", { name: "testcloud_forbidden" }))
    const result = outcome.body?.result as { isError: boolean; content: { text: string }[] }
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain("POLICY_DENIED")
  })

  test("non-object arguments degrade to an empty object", async () => {
    const { deps } = await call(rpc("tools/call", { name: "testcloud_echo", arguments: "oops" }))
    expect(deps.executor.requests[0]?.input).toEqual({})
  })
})

describe("negotiateProtocolVersion", () => {
  test("echoes every revision we claim to speak", () => {
    for (const version of MCP_PROTOCOL_VERSIONS) {
      expect(negotiateProtocolVersion(version)).toBe(version)
    }
  })

  test("falls back to the newest for an absent, unknown or non-string request", () => {
    for (const requested of [undefined, null, 42, {}, "2026-07-28", "nonsense"]) {
      expect(negotiateProtocolVersion(requested)).toBe(MCP_PROTOCOL_VERSION)
    }
  })

  test("the advertised default is one we actually speak", () => {
    expect(MCP_PROTOCOL_VERSIONS).toContain(MCP_PROTOCOL_VERSION)
  })
})

describe("toToolResult", () => {
  test("a scalar output is text-only, with no structuredContent", () => {
    const body = toToolResult({ status: "success", output: 42, timingMs: 1 })
    expect(body.structuredContent).toBeUndefined()
    expect(body.isError).toBe(false)
  })

  test("an error result carries the code in the text", () => {
    const body = toToolResult({
      status: "error",
      error: { code: "DEVICE_OFFLINE", message: "No device." },
      timingMs: 1,
    })
    expect(body.isError).toBe(true)
    expect((body.content as { text: string }[])[0]?.text).toBe("DEVICE_OFFLINE: No device.")
  })
})
