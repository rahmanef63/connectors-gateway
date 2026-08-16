// @vitest-environment node
/**
 * The OAuth client's own checks. Everything here is a rule that, if it broke,
 * would fail either silently (a token stored against the wrong connector) or in
 * a way that looks like the upstream's fault.
 */
import { afterEach, describe, expect, test, vi } from "vitest"

import { authorizeUrl, exchangeCode, registerClient, OAuthExchangeError } from "../client"
import { discoverAuthServer, DiscoveryError } from "../discovery"
import { createPkce, createState } from "../pkce"
import { parseFlowState, type OAuthFlowState } from "../state"

const RESOURCE = "https://example-mcp.convex.site/mcp"
const ISSUER = "https://example-mcp.convex.site"

const AS_DOCUMENT = {
  issuer: ISSUER,
  authorization_endpoint: "https://app.example.com/oauth/authorize",
  token_endpoint: "https://app.example.com/api/oauth/token",
  registration_endpoint: `${ISSUER}/oauth/register`,
  code_challenge_methods_supported: ["S256"],
  scopes_supported: ["mcp.read", "mcp.write"],
}

const PRM_DOCUMENT = {
  resource: RESOURCE,
  authorization_servers: [ISSUER],
  scopes_supported: ["mcp.read", "mcp.write"],
}

/** Serves a fixed map of URL -> document; anything else 404s. */
function stubFetch(documents: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString()
      const body = documents[url]
      if (body === undefined) return new Response("no", { status: 404 })
      return new Response(JSON.stringify(body), { status: 200 })
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("PKCE", () => {
  test("the challenge is the base64url SHA-256 of the verifier", async () => {
    const { verifier, challenge } = await createPkce()
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
    const expected = Buffer.from(new Uint8Array(digest))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    expect(challenge).toBe(expected)
    // No padding and no + or /: these travel in a URL.
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test("two flows never share a verifier or a state", async () => {
    const [a, b] = await Promise.all([createPkce(), createPkce()])
    expect(a.verifier).not.toBe(b.verifier)
    expect(createState()).not.toBe(createState())
  })
})

describe("discovery", () => {
  test("walks protected-resource metadata to the authorization server", async () => {
    stubFetch({
      [`${ISSUER}/.well-known/oauth-protected-resource/mcp`]: PRM_DOCUMENT,
      [`${ISSUER}/.well-known/oauth-authorization-server`]: AS_DOCUMENT,
    })
    const server = await discoverAuthServer(RESOURCE)
    expect(server.authorizationEndpoint).toBe(AS_DOCUMENT.authorization_endpoint)
    expect(server.tokenEndpoint).toBe(AS_DOCUMENT.token_endpoint)
    expect(server.registrationEndpoint).toBe(AS_DOCUMENT.registration_endpoint)
    expect(server.scope).toBe("mcp.read mcp.write")
    expect(server.resource).toBe(RESOURCE)
  })

  test("falls back to the path-less well-known form", async () => {
    stubFetch({
      [`${ISSUER}/.well-known/oauth-protected-resource`]: PRM_DOCUMENT,
      [`${ISSUER}/.well-known/oauth-authorization-server`]: AS_DOCUMENT,
    })
    await expect(discoverAuthServer(RESOURCE)).resolves.toMatchObject({ issuer: ISSUER })
  })

  test("DENIED: a document describing a different issuer", async () => {
    stubFetch({
      [`${ISSUER}/.well-known/oauth-protected-resource`]: PRM_DOCUMENT,
      [`${ISSUER}/.well-known/oauth-authorization-server`]: {
        ...AS_DOCUMENT,
        issuer: "https://elsewhere.example.com",
      },
    })
    await expect(discoverAuthServer(RESOURCE)).rejects.toBeInstanceOf(DiscoveryError)
  })

  test("DENIED: a server that cannot do PKCE S256", async () => {
    stubFetch({
      [`${ISSUER}/.well-known/oauth-protected-resource`]: PRM_DOCUMENT,
      [`${ISSUER}/.well-known/oauth-authorization-server`]: {
        ...AS_DOCUMENT,
        code_challenge_methods_supported: ["plain"],
      },
    })
    await expect(discoverAuthServer(RESOURCE)).rejects.toBeInstanceOf(DiscoveryError)
  })

  test("DENIED: metadata pointing an endpoint at a private address", async () => {
    // The SSRF case this gate exists for: the document is a third party's, and
    // the fetch that follows it happens from inside our network.
    stubFetch({
      [`${ISSUER}/.well-known/oauth-protected-resource`]: PRM_DOCUMENT,
      [`${ISSUER}/.well-known/oauth-authorization-server`]: {
        ...AS_DOCUMENT,
        token_endpoint: "http://169.254.169.254/latest/meta-data/",
      },
    })
    await expect(discoverAuthServer(RESOURCE)).rejects.toBeInstanceOf(DiscoveryError)
  })
})

describe("authorize URL", () => {
  const params = {
    authorizationEndpoint: AS_DOCUMENT.authorization_endpoint,
    clientId: "client_123",
    redirectUri: "https://connectors.example.com/oauth/callback",
    challenge: "chal",
    state: "state_1",
    scope: "mcp.read",
    resource: RESOURCE,
  }

  test("carries everything the server needs and nothing secret", () => {
    const url = new URL(authorizeUrl(params))
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("code_challenge")).toBe("chal")
    expect(url.searchParams.get("redirect_uri")).toBe(params.redirectUri)
    expect(url.searchParams.get("resource")).toBe(RESOURCE)
    // A client secret in a front-channel URL would sit in browser history and
    // in the authorization server's access log.
    expect(url.toString()).not.toContain("client_secret")
  })
})

describe("token exchange", () => {
  const base = {
    tokenEndpoint: AS_DOCUMENT.token_endpoint,
    code: "code_1",
    redirectUri: "https://connectors.example.com/oauth/callback",
    clientId: "client_123",
    verifier: "verifier_1",
    resource: RESOURCE,
  }

  test("sends the verifier and the same redirect_uri, and returns the token", async () => {
    const calls: { url: string; body: string }[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        calls.push({ url: String(input), body: String(init?.body ?? "") })
        return new Response(JSON.stringify({ access_token: "tok_live", expires_in: 3600 }), {
          status: 200,
        })
      }),
    )
    const result = await exchangeCode({ ...base, clientSecret: null })
    expect(result).toEqual({ accessToken: "tok_live", expiresIn: 3600 })

    const sent = new URLSearchParams(calls[0]?.body ?? "")
    expect(sent.get("grant_type")).toBe("authorization_code")
    expect(sent.get("code_verifier")).toBe("verifier_1")
    expect(sent.get("redirect_uri")).toBe(base.redirectUri)
    expect(sent.get("client_secret")).toBeNull()
  })

  test("sends the secret only when there is one", async () => {
    const bodies: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ""))
        return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 })
      }),
    )
    await exchangeCode({ ...base, clientSecret: "shh" })
    expect(new URLSearchParams(bodies[0]).get("client_secret")).toBe("shh")
  })

  test("an OAuth error response becomes a typed failure, not a token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "invalid_grant", error_description: "used" }), {
            status: 400,
          }),
      ),
    )
    await expect(exchangeCode({ ...base, clientSecret: null })).rejects.toBeInstanceOf(
      OAuthExchangeError,
    )
  })

  test("a 200 with no access_token is a failure, not an empty credential", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }))))
    await expect(exchangeCode({ ...base, clientSecret: null })).rejects.toBeInstanceOf(
      OAuthExchangeError,
    )
  })
})

describe("dynamic client registration", () => {
  test("declares only the redirect URI it will actually use", async () => {
    const bodies: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ""))
        return new Response(JSON.stringify({ client_id: "dcr_1" }), { status: 201 })
      }),
    )
    const client = await registerClient(
      AS_DOCUMENT.registration_endpoint,
      "https://connectors.example.com/oauth/callback",
      "Connectors Gateway",
    )
    expect(client).toEqual({ clientId: "dcr_1", clientSecret: null })
    expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({
      redirect_uris: ["https://connectors.example.com/oauth/callback"],
      grant_types: ["authorization_code"],
    })
  })
})

describe("flow state", () => {
  const flow: OAuthFlowState = {
    v: 1,
    connectorId: "careerpack",
    state: "state_1",
    verifier: "verifier_1",
    clientId: "client_1",
    clientSecret: null,
    tokenEndpoint: AS_DOCUMENT.token_endpoint,
    redirectUri: "https://connectors.example.com/oauth/callback",
    resource: RESOURCE,
    exp: 2_000,
  }

  test("round-trips", () => {
    expect(parseFlowState(JSON.stringify(flow), 1_000_000)).toEqual(flow)
  })

  test("DENIED: expired", () => {
    expect(parseFlowState(JSON.stringify(flow), 2_000_001)).toBeNull()
  })

  test("DENIED: missing or wrongly typed fields", () => {
    expect(parseFlowState(JSON.stringify({ ...flow, verifier: "" }), 1_000)).toBeNull()
    expect(parseFlowState(JSON.stringify({ ...flow, clientSecret: 7 }), 1_000)).toBeNull()
    expect(parseFlowState(JSON.stringify({ ...flow, v: 2 }), 1_000)).toBeNull()
    expect(parseFlowState("not json", 1_000)).toBeNull()
  })
})
