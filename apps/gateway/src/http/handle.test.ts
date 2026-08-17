import { describe, expect, test } from "bun:test"
import { fakePairing, httpDeps, testApiKey, TEST_CONNECTOR } from "../__tests__/fixtures"
import { createRateLimiter } from "./rate-limit"
import { handleHttp } from "./handle"
import type { TestGatewayDeps } from "../__tests__/fixtures"

const ORIGIN = "http://localhost:8787"

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

function run(deps: TestGatewayDeps, request: Request, clientKey = "1.2.3.4"): Promise<Response> {
  return handleHttp(deps, request, clientKey)
}

describe("routing", () => {
  test("GET /healthz is public and returns no data", async () => {
    const deps = await httpDeps()
    const response = await run(deps, new Request(`${ORIGIN}/healthz`))
    expect(response.status).toBe(200)
    expect(await json(response)).toEqual({ status: "ok" })
  })

  test("every response carries the request id", async () => {
    const deps = await httpDeps()
    const response = await run(
      deps,
      new Request(`${ORIGIN}/healthz`, { headers: { "x-request-id": "trace-1" } }),
    )
    expect(response.headers.get("x-request-id")).toBe("trace-1")
  })

  test("a hostile inbound request id is replaced, not echoed", async () => {
    const deps = await httpDeps()
    const response = await run(
      deps,
      new Request(`${ORIGIN}/healthz`, { headers: { "x-request-id": "<script>x</script>" } }),
    )
    expect(response.headers.get("x-request-id")).not.toContain("<script>")
  })

  test("an unknown path is a coded 404", async () => {
    const deps = await httpDeps()
    const response = await run(deps, new Request(`${ORIGIN}/admin`))
    expect(response.status).toBe(404)
    expect((await json(response)).error).toMatchObject({ code: "ACTION_NOT_FOUND" })
  })
})

describe("pairing budgets match the agent's real poll schedule", () => {
  /**
   * Regression: /v1/pair/claim shared the 5-per-window pairing budget, but the
   * agent polls it on the 2s→10s curve in apps/agent/src/pairing.ts for the
   * code's whole 5-minute life (~35 requests). The budget was gone 34 seconds
   * in, so any human slower than that got "the pairing code was not approved in
   * time" — for a code they did approve.
   */
  test("a full poll session is not throttled out of existence", async () => {
    const deps = await httpDeps({
      pairing: fakePairing({ claim: async () => null }),
      claimLimiter: createRateLimiter({ limit: 60, windowMs: 10 * 60_000 }),
    })
    const body = { challengeId: "pair_0123456789abcdef0123456789abcd" }

    // 2s + 4s + 8s + 10s… over a 300s code TTL is ~35 polls.
    for (let poll = 0; poll < 35; poll += 1) {
      const response = await run(deps, post("/v1/pair/claim", body))
      expect(response.status).toBe(409)
    }
  })

  test("minting codes stays tightly capped", async () => {
    const deps = await httpDeps({
      pairingLimiter: createRateLimiter({ limit: 5, windowMs: 10 * 60_000 }),
    })
    const body = { deviceName: "Studio PC", platform: "linux" }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await run(deps, post("/v1/pair/start", body))).status).toBe(200)
    }
    expect((await run(deps, post("/v1/pair/start", body))).status).toBe(429)
  })

  test("claims are still bounded once the session budget is spent", async () => {
    const deps = await httpDeps({
      pairing: fakePairing({ claim: async () => null }),
      claimLimiter: createRateLimiter({ limit: 1, windowMs: 10 * 60_000 }),
    })
    const body = { challengeId: "pair_0123456789abcdef0123456789abcd" }
    expect((await run(deps, post("/v1/pair/claim", body))).status).toBe(409)
    expect((await run(deps, post("/v1/pair/claim", body))).status).toBe(429)
  })
})

describe("edge rate limiting", () => {
  /**
   * Regression: /mcp and /v1/* used to carry no limiter at all, so an anonymous
   * caller could force one PBKDF2 round (~28ms of CPU) and one control-plane
   * lookup per request, for free, forever (docs/03 "Apply rate limits").
   */
  test("an anonymous caller cannot spend unbounded auth work on /mcp", async () => {
    const deps = await httpDeps({ edgeLimiter: createRateLimiter({ limit: 2, windowMs: 60_000 }) })
    const body = { jsonrpc: "2.0", id: 1, method: "tools/list" }
    const bearer = { authorization: "Bearer cgk_dev_1_notarealsecretatall" }

    expect((await run(deps, post("/mcp", body, bearer))).status).toBe(401)
    expect((await run(deps, post("/mcp", body, bearer))).status).toBe(401)

    const limited = await run(deps, post("/mcp", body, bearer))
    expect(limited.status).toBe(429)
    expect((await json(limited)).error).toMatchObject({ code: "RATE_LIMITED" })
  })

  test("the limit is per peer, so one abuser cannot lock everyone out", async () => {
    const deps = await httpDeps({ edgeLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }) })
    const request = () => post(`/v1/actions/${TEST_CONNECTOR}/testcloud.echo`, {})

    expect((await run(deps, request(), "9.9.9.9")).status).toBe(401)
    expect((await run(deps, request(), "9.9.9.9")).status).toBe(429)
    expect((await run(deps, request(), "8.8.8.8")).status).toBe(401)
  })

  test("liveness probes are never throttled", async () => {
    const deps = await httpDeps({ edgeLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }) })
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await run(deps, new Request(`${ORIGIN}/healthz`))).status).toBe(200)
    }
  })
})

describe("POST /v1/actions/:connector/:action", () => {
  test("without a bearer token it is 401", async () => {
    const deps = await httpDeps()
    const response = await run(deps, post(`/v1/actions/${TEST_CONNECTOR}/testcloud.echo`, {}))
    expect(response.status).toBe(401)
    expect((await json(response)).error).toMatchObject({ code: "NOT_AUTHENTICATED" })
  })

  test("executes and returns a normalized success body", async () => {
    const deps = await httpDeps()
    const { token } = await testApiKey()
    const response = await run(
      deps,
      post(`/v1/actions/${TEST_CONNECTOR}/testcloud.echo`, { keep: "yes" }, {
        authorization: `Bearer ${token}`,
      }),
    )
    expect(response.status).toBe(200)
    const body = await json(response)
    expect(body).toMatchObject({ status: "success", output: { ok: true } })
    expect(deps.audit.events).toHaveLength(1)
  })

  test("a policy denial maps to 403 with the code", async () => {
    const deps = await httpDeps()
    const { token } = await testApiKey()
    const response = await run(
      deps,
      post(`/v1/actions/${TEST_CONNECTOR}/testcloud.forbidden`, {}, {
        authorization: `Bearer ${token}`,
      }),
    )
    expect(response.status).toBe(403)
    expect((await json(response)).error).toMatchObject({ code: "POLICY_DENIED" })
  })

  test("REQUIRE_APPROVAL maps to 409", async () => {
    const deps = await httpDeps()
    const { token } = await testApiKey()
    const response = await run(
      deps,
      post(`/v1/actions/${TEST_CONNECTOR}/testcloud.risky`, {}, {
        authorization: `Bearer ${token}`,
      }),
    )
    expect(response.status).toBe(409)
    expect((await json(response)).error).toMatchObject({ code: "APPROVAL_REQUIRED" })
  })

  test("a non-JSON content type is refused", async () => {
    const deps = await httpDeps()
    const response = await run(
      deps,
      new Request(`${ORIGIN}/v1/actions/${TEST_CONNECTOR}/testcloud.echo`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "hello",
      }),
    )
    expect(response.status).toBe(400)
  })
})

describe("GET /v1/catalog", () => {
  test("requires authentication", async () => {
    const deps = await httpDeps()
    const response = await run(deps, new Request(`${ORIGIN}/v1/catalog`))
    expect(response.status).toBe(401)
  })

  test("returns only the caller's connected connectors", async () => {
    const deps = await httpDeps()
    const { token } = await testApiKey()
    const response = await run(
      deps,
      new Request(`${ORIGIN}/v1/catalog`, { headers: { authorization: `Bearer ${token}` } }),
    )
    const body = await json(response)
    const connectors = body.connectors as { id: string }[]
    expect(connectors.map((connector) => connector.id)).toEqual([TEST_CONNECTOR])
  })
})

describe("pairing", () => {
  test("start returns a code and a dashboard verification url", async () => {
    const deps = await httpDeps()
    const response = await run(
      deps,
      post("/v1/pair/start", { deviceName: "Studio PC", platform: "linux" }),
    )
    expect(response.status).toBe(200)
    expect(await json(response)).toMatchObject({
      challengeId: "pair_0123456789abcdef0123456789abcd",
      code: "ABCD2345",
      verificationUrl: "http://localhost:3000/pair?code=ABCD2345",
    })
  })

  test("start validates the device name and platform", async () => {
    const deps = await httpDeps()
    expect((await run(deps, post("/v1/pair/start", { deviceName: "x", platform: "solaris" }))).status).toBe(400)
    expect(
      (await run(deps, post("/v1/pair/start", { deviceName: "<script>", platform: "linux" }))).status,
    ).toBe(400)
  })

  test("start is rate limited per peer", async () => {
    const deps = await httpDeps({
      pairingLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    const body = { deviceName: "Studio PC", platform: "linux" }
    expect((await run(deps, post("/v1/pair/start", body))).status).toBe(200)
    const limited = await run(deps, post("/v1/pair/start", body))
    expect(limited.status).toBe(429)
  })

  test("claim returns the plaintext credential exactly once", async () => {
    const deps = await httpDeps()
    const response = await run(deps, post("/v1/pair/claim", { challengeId: "pair_0123456789abcdef0123456789abcd" }))
    const body = await json(response)
    expect(body.credential).toBe("cgd_dev_1_abcdefabcdefabcdef")
    expect(body.deviceId).toBe("dev_1")
  })

  test("an unapproved or already-claimed challenge is 409 with one generic message", async () => {
    const deps = await httpDeps({ pairing: fakePairing({ claim: async () => null }) })
    const response = await run(deps, post("/v1/pair/claim", { challengeId: "pair_0123456789abcdef0123456789abcd" }))
    expect(response.status).toBe(409)
    expect((await json(response)).error).toMatchObject({ code: "APPROVAL_REQUIRED" })
  })

  test("a malformed challenge id never reaches the store", async () => {
    let called = false
    const deps = await httpDeps({
      pairing: fakePairing({
        claim: async () => {
          called = true
          return null
        },
      }),
    })
    const response = await run(deps, post("/v1/pair/claim", { challengeId: "../../etc" }))
    expect(response.status).toBe(400)
    expect(called).toBe(false)
  })
})

describe("POST /mcp", () => {
  test("requires a bearer token", async () => {
    const deps = await httpDeps()
    const response = await run(deps, post("/mcp", { jsonrpc: "2.0", id: 1, method: "ping" }))
    expect(response.status).toBe(401)
    // The pointer is the load-bearing part: without it a client learns only
    // that it needs a token, with no way to discover where to get one.
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://localhost:8787/.well-known/oauth-protected-resource"',
    )
  })

  test("the challenge points at a document this gateway actually serves", async () => {
    const deps = await httpDeps()
    const response = await run(deps, post("/mcp", { jsonrpc: "2.0", id: 1, method: "ping" }))
    const url = /resource_metadata="([^"]+)"/.exec(
      response.headers.get("www-authenticate") ?? "",
    )?.[1]
    expect(url).toBeTruthy()
    // A pointer to a 404 is worse than no pointer: the client stops there.
    const followed = await run(deps, new Request(url as string))
    expect(followed.status).toBe(200)
  })

  test("answers a ping for an authenticated caller", async () => {
    const deps = await httpDeps()
    const { token } = await testApiKey()
    const response = await run(
      deps,
      post("/mcp", { jsonrpc: "2.0", id: 1, method: "ping" }, { authorization: `Bearer ${token}` }),
    )
    expect(response.status).toBe(200)
    expect(await json(response)).toMatchObject({ jsonrpc: "2.0", id: 1, result: {} })
  })
})
