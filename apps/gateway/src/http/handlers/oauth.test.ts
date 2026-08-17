import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { fakeOAuth, httpDeps } from "../../__tests__/fixtures"
import { createRateLimiter } from "../rate-limit"
import { handleHttp } from "../handle"
import type { TestGatewayDeps } from "../../__tests__/fixtures"

const ORIGIN = "http://localhost:8787"

function registerRequest(body: unknown): Request {
  return new Request(`${ORIGIN}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function tokenRequest(fields: Record<string, string>): Request {
  return new Request(`${ORIGIN}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  })
}

const VALID_TOKEN_FIELDS = {
  grant_type: "authorization_code",
  code: "a".repeat(64),
  code_verifier: "v".repeat(64),
  client_id: "cgc_test",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
}

async function run(request: Request, deps?: TestGatewayDeps): Promise<Response> {
  return handleHttp(deps ?? (await httpDeps()), request, "1.2.3.4")
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

describe("POST /oauth/register", () => {
  test("registers a public client and says so in the response", async () => {
    const response = await run(
      registerRequest({
        client_name: "Claude",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      }),
    )
    expect(response.status).toBe(201)
    const payload = await body(response)
    expect(payload.client_id).toBe("cgc_test")
    // The ABSENCE of client_secret is the contract, not an omission.
    expect(payload.client_secret).toBeUndefined()
    expect(payload.token_endpoint_auth_method).toBe("none")
  })

  test("needs at least one redirect uri", async () => {
    const response = await run(registerRequest({ client_name: "Claude", redirect_uris: [] }))
    expect(response.status).toBe(400)
    expect((await body(response)).error).toBe("invalid_request")
  })

  test("refuses a redirect uri list containing a non-string", async () => {
    // Filtering it out silently would register a client whose real URI list is
    // shorter than it believes, and the failure would surface at redirect time.
    const response = await run(
      registerRequest({ client_name: "Claude", redirect_uris: ["https://ok.test/cb", 42] }),
    )
    expect(response.status).toBe(400)
  })

  test("forwards a control-plane rejection as the client's fault", async () => {
    const deps = await httpDeps({
      oauth: fakeOAuth({
        registerClient: () => {
          throw new GatewayError("INVALID_INPUT", "A redirect URI must be https.")
        },
      }),
    })
    const response = await run(
      registerRequest({ client_name: "Evil", redirect_uris: ["http://evil.test/cb"] }),
      deps,
    )
    expect(response.status).toBe(400)
    expect((await body(response)).error).toBe("invalid_request")
  })

  test("an internal failure is never reported as the client's fault", async () => {
    const deps = await httpDeps({
      oauth: fakeOAuth({
        registerClient: () => {
          throw new Error("convex exploded")
        },
      }),
    })
    const response = await run(registerRequest({ redirect_uris: ["https://ok.test/cb"] }), deps)
    expect(response.status).toBe(500)
    const payload = await body(response)
    expect(payload.error).toBe("server_error")
    // The upstream message must not travel: it can quote arguments.
    expect(JSON.stringify(payload)).not.toContain("convex exploded")
  })
})

describe("POST /oauth/token", () => {
  test("exchanges a code for a bearer token", async () => {
    const response = await run(tokenRequest(VALID_TOKEN_FIELDS))
    expect(response.status).toBe(200)
    const payload = await body(response)
    expect(payload.token_type).toBe("Bearer")
    expect(payload.access_token).toContain("cgk_")
    expect(payload.expires_in).toBe(3600)
    // No refresh token: an absent field is how a client learns to re-run the
    // flow rather than wait for a refresh that never arrives.
    expect(payload.refresh_token).toBeUndefined()
  })

  test("a token response is never cacheable (RFC 6749 §5.1)", async () => {
    const response = await run(tokenRequest(VALID_TOKEN_FIELDS))
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  test("rejects JSON — the RFC mandates form encoding", async () => {
    const response = await run(
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_TOKEN_FIELDS),
      }),
    )
    expect(response.status).toBe(400)
    expect((await body(response)).error).toBe("invalid_request")
  })

  test("names an unsupported grant type instead of hiding it", async () => {
    const response = await run(
      tokenRequest({ ...VALID_TOKEN_FIELDS, grant_type: "client_credentials" }),
    )
    expect((await body(response)).error).toBe("unsupported_grant_type")
  })

  test("PKCE is mandatory: a missing verifier is refused before the store", async () => {
    const deps = await httpDeps()
    const { code_verifier: _absent, ...withoutVerifier } = VALID_TOKEN_FIELDS
    const response = await run(tokenRequest(withoutVerifier), deps)
    expect(response.status).toBe(400)
    expect((await body(response)).error).toBe("invalid_request")
    // Never reached the control plane, so no code was consumed by the attempt.
    expect((deps.oauth as ReturnType<typeof fakeOAuth>).calls).toEqual([])
  })

  test("every grant rejection looks identical", async () => {
    // A token endpoint that distinguishes unknown-code from wrong-verifier is an
    // oracle telling a code thief which parameter to change.
    const deps = await httpDeps({
      oauth: fakeOAuth({
        redeemCode: () => {
          throw new GatewayError("NOT_AUTHORIZED", "Invalid authorization grant.")
        },
      }),
    })
    const first = await body(await run(tokenRequest(VALID_TOKEN_FIELDS), deps))
    const second = await body(
      await run(tokenRequest({ ...VALID_TOKEN_FIELDS, code: "b".repeat(64) }), deps),
    )
    expect(first).toEqual(second)
    expect(first.error).toBe("invalid_grant")
  })

  test("a repeated parameter takes the first value, not the last", async () => {
    // URLSearchParams.get is last-wins, which would let `code=x&code=y` show one
    // value to a log and another to the verifier.
    const deps = await httpDeps()
    await run(
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `grant_type=authorization_code&code=first&code=second&code_verifier=${"v".repeat(64)}&client_id=cgc_test&redirect_uri=https%3A%2F%2Fok.test%2Fcb`,
      }),
      deps,
    )
    const calls = (deps.oauth as ReturnType<typeof fakeOAuth>).calls
    expect(calls[0]?.code).toBe("first")
  })

  test("both endpoints are throttled independently of the edge budget", async () => {
    const deps = await httpDeps({
      oauthLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    expect((await run(tokenRequest(VALID_TOKEN_FIELDS), deps)).status).toBe(200)
    const throttled = await run(tokenRequest(VALID_TOKEN_FIELDS), deps)
    expect(throttled.status).toBe(429)
  })
})
