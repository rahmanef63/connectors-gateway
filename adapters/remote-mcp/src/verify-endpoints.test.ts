import { describe, expect, test } from "bun:test"
import type { ConnectorManifest } from "@cg/core"
import { verifyRemoteEndpoint, verifyRemoteEndpoints } from "./verify-endpoints"

const ENDPOINT = "https://api.example.test/mcp"
const RESOURCE_METADATA = "https://api.example.test/.well-known/oauth-protected-resource"
const AUTHORIZATION_SERVER = "https://auth.example.test"
const AUTHORIZATION_METADATA =
  "https://auth.example.test/.well-known/oauth-authorization-server"
const AUTHORIZATION_ENDPOINT = "https://app.example.test/oauth/authorize"
const TOKEN_ENDPOINT = "https://auth.example.test/oauth/token"
const REGISTRATION_ENDPOINT = "https://auth.example.test/oauth/register"

function manifest(overrides: Partial<ConnectorManifest> = {}): ConnectorManifest {
  return {
    id: "fixture",
    name: "Fixture",
    version: "0.1.0",
    executor: "cloud",
    endpoint: ENDPOINT,
    verification: {
      environment: "production",
      resourceMetadata: RESOURCE_METADATA,
      authorizationServer: AUTHORIZATION_SERVER,
      authorizationEndpoint: AUTHORIZATION_ENDPOINT,
      tokenEndpoint: TOKEN_ENDPOINT,
      registrationEndpoint: REGISTRATION_ENDPOINT,
    },
    auth: { type: "oauth2" },
    actions: [],
    ...overrides,
  }
}

type StubOptions = {
  challengeMetadata?: string
  resource?: string
  authorizationServers?: string[]
  issuer?: string
  authorizationEndpoint?: string
  tokenEndpoint?: string
  registrationEndpoint?: string
  endpointStatus?: number
}

function stub(options: StubOptions = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, init })
    if (url === ENDPOINT) {
      return new Response("unauthorized", {
        status: options.endpointStatus ?? 401,
        headers: {
          "www-authenticate": `Bearer realm="fixture", resource_metadata="${options.challengeMetadata ?? RESOURCE_METADATA}"`,
        },
      })
    }
    if (url === RESOURCE_METADATA) {
      return Response.json({
        resource: options.resource ?? ENDPOINT,
        authorization_servers: options.authorizationServers ?? [AUTHORIZATION_SERVER],
      })
    }
    if (url === AUTHORIZATION_METADATA) {
      return Response.json({
        issuer: options.issuer ?? AUTHORIZATION_SERVER,
        authorization_endpoint: options.authorizationEndpoint ?? AUTHORIZATION_ENDPOINT,
        token_endpoint: options.tokenEndpoint ?? TOKEN_ENDPOINT,
        registration_endpoint: options.registrationEndpoint ?? REGISTRATION_ENDPOINT,
      })
    }
    return new Response("not found", { status: 404 })
  }
  return { calls, fetcher: fetcher as typeof fetch }
}

function header(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name)
}

describe("production endpoint verification", () => {
  test("proves the complete OAuth discovery chain without sending a credential", async () => {
    const { calls, fetcher } = stub()

    const result = await verifyRemoteEndpoint(manifest(), fetcher)

    expect(result).toEqual({
      connectorId: "fixture",
      endpoint: ENDPOINT,
      authorizationServer: AUTHORIZATION_SERVER,
      authorizationEndpoint: AUTHORIZATION_ENDPOINT,
      tokenEndpoint: TOKEN_ENDPOINT,
    })
    expect(calls.map((call) => call.url)).toEqual([
      ENDPOINT,
      RESOURCE_METADATA,
      AUTHORIZATION_METADATA,
    ])
    expect(calls[0]?.init.redirect).toBe("manual")
    expect(calls[0]?.init.method).toBe("POST")
    for (const call of calls) expect(header(call.init, "authorization")).toBeNull()
  })

  test("refuses a valid-looking challenge that points at another deployment", async () => {
    const { calls, fetcher } = stub({
      challengeMetadata: "https://dev.example.test/.well-known/oauth-protected-resource",
    })

    await expect(verifyRemoteEndpoint(manifest(), fetcher)).rejects.toThrow(
      "unexpected resource metadata",
    )
    expect(calls).toHaveLength(1)
  })

  test("refuses metadata whose resource is not the reviewed MCP endpoint", async () => {
    const { fetcher } = stub({ resource: "https://dev.example.test/mcp" })
    await expect(verifyRemoteEndpoint(manifest(), fetcher)).rejects.toThrow(
      "unexpected MCP endpoint",
    )
  })

  test("refuses an extra or substituted authorization server", async () => {
    const { fetcher } = stub({
      authorizationServers: [AUTHORIZATION_SERVER, "https://dev.example.test"],
    })
    await expect(verifyRemoteEndpoint(manifest(), fetcher)).rejects.toThrow(
      "unexpected authorization server",
    )
  })

  test("refuses a local browser endpoint even when the rest of discovery is valid", async () => {
    const { fetcher } = stub({ authorizationEndpoint: "https://careerpack.local/oauth/authorize" })
    await expect(verifyRemoteEndpoint(manifest(), fetcher)).rejects.toThrow(
      "reviewed public DNS name",
    )
  })

  test("never follows an MCP redirect", async () => {
    const { calls, fetcher } = stub({ endpointStatus: 307 })
    await expect(verifyRemoteEndpoint(manifest(), fetcher)).rejects.toThrow("redirected")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init.redirect).toBe("manual")
  })

  test("requires every fixed shipped endpoint to carry a review block", async () => {
    const unpinned = manifest({ verification: undefined })
    await expect(verifyRemoteEndpoints([unpinned], stub().fetcher)).rejects.toThrow(
      "no reviewed production verification block",
    )
  })

  test("skips per-user endpoints because no single production URL can be pinned", async () => {
    const dynamic = manifest({ endpoint: undefined, verification: undefined })
    const { calls, fetcher } = stub()
    await expect(verifyRemoteEndpoints([dynamic], fetcher)).resolves.toEqual([])
    expect(calls).toEqual([])
  })
})
