import { describe, expect, test } from "bun:test"
import { httpDeps, testConfig } from "../../__tests__/fixtures"
import { handleHttp } from "../handle"
import { authorizationServerMetadata, protectedResourceMetadata } from "./well-known"

const ORIGIN = "http://localhost:8787"

async function get(path: string, clientKey = "1.2.3.4"): Promise<Response> {
  return handleHttp(await httpDeps(), new Request(`${ORIGIN}${path}`), clientKey)
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

describe("discovery routing", () => {
  test.each([
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-authorization-server",
  ])("%s is public, cacheable and CORS-open", async (path) => {
    const response = await get(path)
    expect(response.status).toBe(200)
    // No credential was presented. If any of these ever needs one, discovery is
    // broken by construction — a client fetches them BEFORE it has a token.
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600")
  })

  test("both protected-resource paths answer identically", async () => {
    // RFC 9728 §3.1 allows the resource path to be appended; clients differ on
    // which one they try, and a 404 on either reads as "no OAuth here".
    expect(await body(await get("/.well-known/oauth-protected-resource"))).toEqual(
      await body(await get("/.well-known/oauth-protected-resource/mcp")),
    )
  })

  test("preflight is answered without a body", async () => {
    const response = await handleHttp(
      await httpDeps(),
      new Request(`${ORIGIN}/.well-known/oauth-authorization-server`, { method: "OPTIONS" }),
      "1.2.3.4",
    )
    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-methods")).toContain("GET")
  })

  test("discovery is never rate limited, however hot the peer", async () => {
    // One shared egress serves every user of a hosted AI client. Metering this
    // would let one tenant make the gateway undiscoverable for all of them.
    const deps = await httpDeps()
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await handleHttp(
        deps,
        new Request(`${ORIGIN}/.well-known/oauth-protected-resource`),
        "same.peer",
      )
      expect(response.status).toBe(200)
    }
  })
})

describe("protected resource metadata (RFC 9728)", () => {
  const document = protectedResourceMetadata(testConfig)

  test("names the MCP endpoint as the resource, not the origin", () => {
    expect(document.resource).toBe(`${testConfig.publicUrl}/mcp`)
  })

  test("points at this origin as its own authorization server", () => {
    // Must match the issuer below, or RFC 8414 validation fails at the client.
    expect(document.authorization_servers).toEqual([testConfig.publicUrl])
  })

  test("advertises no scopes, because none are enforced", () => {
    // Deliberate. Manifests declare no requiredScopes and API keys are issued
    // with none, so any scope named here would gate nothing. Delete this test
    // the day a manifest declares one — and add the scope to the document.
    expect(document.scopes_supported).toBeUndefined()
  })
})

describe("authorization server metadata (RFC 8414)", () => {
  const document = authorizationServerMetadata(testConfig)

  test("the issuer is where the document is served from", () => {
    expect(document.issuer).toBe(testConfig.publicUrl)
  })

  test("sends the human to the dashboard and the machine to the gateway", () => {
    expect(document.authorization_endpoint).toBe(`${testConfig.webPublicUrl}/oauth/authorize`)
    expect(document.token_endpoint).toBe(`${testConfig.publicUrl}/oauth/token`)
    expect(document.registration_endpoint).toBe(`${testConfig.publicUrl}/oauth/register`)
  })

  test("offers S256 only — never plain", () => {
    expect(document.code_challenge_methods_supported).toEqual(["S256"])
  })

  test("claims no client authentication, since registration mints no secret", () => {
    expect(document.token_endpoint_auth_methods_supported).toEqual(["none"])
  })
})
