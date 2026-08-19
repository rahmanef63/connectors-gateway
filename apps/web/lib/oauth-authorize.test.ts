import { describe, expect, it } from "vitest"
import { MCP_SCOPES, SCOPE_READ } from "@cg/core"

import { buildRedirect, parseAuthorizationRequest } from "./oauth-authorize"

const RESOURCE = "https://connect.rahmanef.com/mcp"
const ISSUER = "https://connect.rahmanef.com"

const VALID = {
  response_type: "code",
  client_id: "cgc_abc",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  resource: RESOURCE,
  scope: "mcp.read mcp.write",
  state: "opaque-state",
}

describe("parseAuthorizationRequest", () => {
  it("accepts a well-formed request", () => {
    expect(parseAuthorizationRequest(VALID)).toEqual({
      clientId: "cgc_abc",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      codeChallengeMethod: "S256",
      resource: RESOURCE,
      scopes: [...MCP_SCOPES],
      state: "opaque-state",
    })
  })

  it("normalizes and binds the requested resource", () => {
    expect(
      parseAuthorizationRequest({ ...VALID, resource: "HTTPS://CONNECT.RAHMANEF.COM:443/mcp" })
        ?.resource,
    ).toBe(RESOURCE)
  })

  it("accepts an explicit read-only request", () => {
    expect(parseAuthorizationRequest({ ...VALID, scope: SCOPE_READ })?.scopes).toEqual([
      SCOPE_READ,
    ])
  })

  it("keeps full access for an older client that omits scope", () => {
    const { scope: _absent, ...rest } = VALID
    expect(parseAuthorizationRequest(rest)?.scopes).toEqual([...MCP_SCOPES])
  })

  it.each(["mcp.unknown", "mcp.read  mcp.write"])(
    "refuses unsupported or malformed scope %s",
    (scope) => expect(parseAuthorizationRequest({ ...VALID, scope })).toBeNull(),
  )

  it("refuses a repeated scope parameter instead of merging authority", () => {
    expect(parseAuthorizationRequest({ ...VALID, scope: ["mcp.read", "mcp.write"] })).toBeNull()
  })

  it("refuses the implicit grant outright", () => {
    // OAuth 2.1 removed it. This server must not even appear to offer it.
    expect(parseAuthorizationRequest({ ...VALID, response_type: "token" })).toBeNull()
  })

  it.each(["client_id", "redirect_uri", "code_challenge", "response_type", "resource"] as const)(
    "refuses a request missing %s",
    (key) => {
      const { [key]: _absent, ...rest } = VALID
      expect(parseAuthorizationRequest(rest)).toBeNull()
    },
  )

  it("binds a legacy request that omitted resource to a trusted expected audience", () => {
    const { resource: _absent, ...rest } = VALID
    expect(parseAuthorizationRequest(rest, RESOURCE)?.resource).toBe(RESOURCE)
    expect(parseAuthorizationRequest(rest)).toBeNull()
  })

  it("refuses a resource other than the deployment's MCP endpoint", () => {
    expect(
      parseAuthorizationRequest({ ...VALID, resource: "https://evil.test/mcp" }, RESOURCE),
    ).toBeNull()
  })

  it("refuses a repeated parameter rather than picking one", () => {
    // `?redirect_uri=good&redirect_uri=evil` is a real technique; choosing
    // either value guesses at an intent the request does not express.
    expect(
      parseAuthorizationRequest({
        ...VALID,
        redirect_uri: ["https://claude.ai/cb", "https://evil.test/cb"],
      }),
    ).toBeNull()
  })

  it("reports an absent challenge method as plain, never as S256", () => {
    // RFC 7636 defaults it to `plain`. Defaulting to S256 here would silently
    // accept a downgraded request; the server-side check then rejects it.
    const { code_challenge_method: _absent, ...rest } = VALID
    expect(parseAuthorizationRequest(rest)?.codeChallengeMethod).toBe("plain")
  })

  it("treats an absent state as absent, not as empty", () => {
    const { state: _absent, ...rest } = VALID
    expect(parseAuthorizationRequest(rest)?.state).toBeNull()
  })

  it("refuses a state that is present but unusable, rather than dropping it", () => {
    // Silently dropping it echoes back a response with no state, which an
    // honest client must reject — with no way to tell we mangled its token.
    expect(parseAuthorizationRequest({ ...VALID, state: "x".repeat(4096) })).toBeNull()
    expect(parseAuthorizationRequest({ ...VALID, state: ["a", "b"] })).toBeNull()
  })
})

describe("buildRedirect", () => {
  it("appends the code and echoes state", () => {
    const url = buildRedirect("https://claude.ai/cb", { code: "abc123" }, "st", ISSUER)
    expect(url).toBe("https://claude.ai/cb?code=abc123&state=st&iss=https%3A%2F%2Fconnect.rahmanef.com")
  })

  it("preserves a query the registered URI already carried", () => {
    const url = buildRedirect("https://claude.ai/cb?tenant=acme", { code: "abc" }, null, ISSUER)
    expect(url).toBe("https://claude.ai/cb?tenant=acme&code=abc&iss=https%3A%2F%2Fconnect.rahmanef.com")
  })

  it("echoes state on denial too", () => {
    // A client that cannot match the response to its request must treat it as
    // an attack, so dropping state on denial breaks honest clients.
    const url = buildRedirect("https://claude.ai/cb", { error: "access_denied" }, "st", ISSUER)
    expect(url).toBe("https://claude.ai/cb?error=access_denied&state=st&iss=https%3A%2F%2Fconnect.rahmanef.com")
  })

  it("omits state entirely when the client sent none", () => {
    expect(buildRedirect("https://claude.ai/cb", { code: "abc" }, null, ISSUER)).toBe(
      "https://claude.ai/cb?code=abc&iss=https%3A%2F%2Fconnect.rahmanef.com",
    )
  })

  it("handles a private-use scheme, which desktop clients rely on", () => {
    const url = buildRedirect("com.example.app://cb", { code: "abc" }, null, ISSUER)
    expect(url).toContain("code=abc")
    expect(url.startsWith("com.example.app://")).toBe(true)
  })

  it("percent-encodes a hostile state instead of splitting the query", () => {
    const url = buildRedirect("https://claude.ai/cb", { code: "abc" }, "a&code=evil", ISSUER)
    expect(url).toBe("https://claude.ai/cb?code=abc&state=a%26code%3Devil&iss=https%3A%2F%2Fconnect.rahmanef.com")
    // The injected pair must not become a second `code`.
    expect(new URL(url).searchParams.getAll("code")).toEqual(["abc"])
  })
})
