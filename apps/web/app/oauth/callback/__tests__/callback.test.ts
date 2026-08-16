// @vitest-environment node
/**
 * The callback is where a credential is created, so it is tested as a whole:
 * real sealing, real flow-state cookie, real token exchange over a stubbed
 * socket. Only the two boundaries this app does not own are mocked — the cookie
 * jar and the Convex client.
 *
 * What each case protects:
 *  - a wrong `state` must not store anything (a code delivered to a callback
 *    nobody started is an attacker's code);
 *  - the stored `baseUrl` comes from the MANIFEST, never from the cookie;
 *  - what reaches Convex is ciphertext, never the token.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { open } from "@cg/auth"

const KEY = Buffer.alloc(32, 7).toString("base64")
const RESOURCE = "https://effervescent-hedgehog-352.convex.site/mcp"
const REDIRECT = "https://connectors.example.com/oauth/callback"

const cookieJar = new Map<string, string>()
const mutations: { args: Record<string, unknown> }[] = []

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name)
      return value === undefined ? undefined : { name, value }
    },
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (options: { name: string } | string) =>
      void cookieJar.delete(typeof options === "string" ? options : options.name),
  }),
}))

vi.mock("convex/nextjs", () => ({
  fetchMutation: async (_reference: unknown, args: Record<string, unknown>) => {
    mutations.push({ args })
    return { connectionId: "conn_1" }
  },
  fetchQuery: async () => ({ email: "owner@example.com" }),
}))

vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsToken: async () => "session-token",
}))

const { GET } = await import("../route")
const { writeFlowState } = await import("@/lib/oauth")

const FLOW = {
  connectorId: "careerpack",
  state: "state_1",
  verifier: "verifier_1",
  clientId: "client_1",
  clientSecret: null,
  tokenEndpoint: "https://careerpack.org/api/oauth/token",
  redirectUri: REDIRECT,
  resource: RESOURCE,
}

function callback(query: string): Request {
  return new Request(`https://connectors.example.com/oauth/callback?${query}`)
}

function tokenServer(token = "cp_live_token"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ access_token: token }), { status: 200 })),
  )
}

beforeEach(() => {
  vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", KEY)
  cookieJar.clear()
  mutations.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("oauth callback", () => {
  test("exchanges the code and stores a sealed credential", async () => {
    await writeFlowState(FLOW)
    tokenServer()

    const response = await GET(callback("code=abc&state=state_1"))

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toContain("connected=careerpack")
    expect(mutations).toHaveLength(1)

    const args = mutations[0]?.args ?? {}
    expect(args["connectorId"]).toBe("careerpack")
    // From the shipped manifest — not from the cookie, and not from the URL.
    expect(args["baseUrl"]).toBe(RESOURCE)
    expect(args["authType"]).toBe("bearer")
    // The token itself never reaches Convex.
    expect(args["tokenCipher"]).not.toBe("cp_live_token")
    expect(String(args["tokenCipher"])).toMatch(/^v1\./)
    expect(await open(String(args["tokenCipher"]), KEY)).toBe("cp_live_token")
  })

  test("the flow is single-use — a replayed callback finds nothing", async () => {
    await writeFlowState(FLOW)
    tokenServer()
    await GET(callback("code=abc&state=state_1"))

    const replay = await GET(callback("code=abc&state=state_1"))
    expect(replay.headers.get("location")).toContain("connect_error=flow_expired")
    expect(mutations).toHaveLength(1)
  })

  test("DENIED: a state that does not match the flow", async () => {
    await writeFlowState(FLOW)
    tokenServer()

    const response = await GET(callback("code=abc&state=someone_elses"))
    expect(response.headers.get("location")).toContain("connect_error=state_mismatch")
    expect(mutations).toHaveLength(0)
  })

  test("DENIED: the user refused consent", async () => {
    await writeFlowState(FLOW)
    const response = await GET(callback("error=access_denied&state=state_1"))
    expect(response.headers.get("location")).toContain("connect_error=consent_denied")
    expect(mutations).toHaveLength(0)
  })

  test("an upstream refusal stores nothing and says so", async () => {
    await writeFlowState(FLOW)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })),
    )

    const response = await GET(callback("code=abc&state=state_1"))
    expect(response.headers.get("location")).toContain("connect_error=exchange_failed")
    expect(mutations).toHaveLength(0)
  })

  test("DENIED: a tampered cookie is not a flow", async () => {
    await writeFlowState(FLOW)
    // Flip a character in the ciphertext: AES-GCM's tag check fails, and a
    // failed open is indistinguishable from no cookie at all.
    const [name, sealed] = [...cookieJar.entries()][0] ?? ["", ""]
    cookieJar.set(name, `${sealed.slice(0, -2)}${sealed.endsWith("A") ? "B" : "A"}=`)

    const response = await GET(callback("code=abc&state=state_1"))
    expect(response.headers.get("location")).toContain("connect_error=flow_expired")
    expect(mutations).toHaveLength(0)
  })
})
