/**
 * OAuth discovery documents (docs/18-oauth.md).
 *
 * These MUST be served from the gateway's own origin, next to `/mcp`. An MCP
 * client's first probe goes to the host of the MCP URL, never to the host of
 * the dashboard — mirroring these at connectors.rahmanef.com looks right in a
 * browser and still fails at connect time, because the probe never touches
 * that host. This is the single most common way a server that *has* OAuth
 * reads to a client as a server that does not.
 *
 * Both documents are public and unauthenticated by definition: every client
 * fetches them before it holds any credential, including from a browser, which
 * is why they carry CORS and are the only cacheable responses on this edge.
 */
import type { GatewayConfig } from "../../config"
import type { RouteContext } from "../routes"

const CORS: Readonly<Record<string, string>> = Object.freeze({
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
})

function metadata(body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...CORS,
      "cache-control": "public, max-age=3600",
    },
  })
}

export function handleMetadataPreflight(): Promise<Response> {
  return Promise.resolve(
    new Response(null, { status: 204, headers: { ...CORS, "access-control-max-age": "86400" } }),
  )
}

export function mcpResourceUrl(config: GatewayConfig): string {
  return `${config.publicUrl}/mcp`
}

/** RFC 9728. Names the resource and points at whoever can issue tokens for it. */
export function protectedResourceMetadata(config: GatewayConfig): Record<string, unknown> {
  return {
    resource: mcpResourceUrl(config),
    // This origin is its own authorization server: the RFC 8414 document below
    // is served here, so "the issuer matches where the document was found"
    // holds. That the consent screen runs on the dashboard is an internal
    // detail the client never has to reason about.
    authorization_servers: [config.publicUrl],
    bearer_methods_supported: ["header"],
    // `scopes_supported` is OMITTED on purpose, and its absence is the honest
    // answer. No connector manifest declares `requiredScopes`, and API keys are
    // issued with `scopes: []`, so every scope string this server could name
    // would gate exactly nothing. Advertising `connectors.read` here would tell
    // a client it was obtaining a restricted token when it was not — the same
    // hole as scopes that are advertised and never enforced. Authority is
    // bounded by the policy engine and the approval queue instead; when a
    // manifest first declares a scope, list it here and not before.
  }
}

/** RFC 8414. Where to send the user, where to redeem the code, what we accept. */
export function authorizationServerMetadata(config: GatewayConfig): Record<string, unknown> {
  return {
    issuer: config.publicUrl,
    // The one endpoint that needs a human and a session, so it lives on the
    // dashboard; everything else is machine-to-machine and stays here.
    authorization_endpoint: `${config.webPublicUrl}/oauth/authorize`,
    token_endpoint: `${config.publicUrl}/oauth/token`,
    // RFC 7591. Served because a host that cannot register has no way to obtain
    // a client id at all: neither claude.ai's connector form nor ChatGPT's
    // connection modal offers a field to paste one into.
    registration_endpoint: `${config.publicUrl}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    // S256 only, and advertised as such so a client does not even attempt
    // `plain` — which the token endpoint refuses anyway.
    code_challenge_methods_supported: ["S256"],
    // Public clients only. Registration mints no secret, so there is nothing
    // for a client to authenticate WITH; advertising `client_secret_post` would
    // invite a client to send a secret this server would silently ignore.
    token_endpoint_auth_methods_supported: ["none"],
  }
}

export function handleProtectedResource(context: RouteContext): Promise<Response> {
  return Promise.resolve(metadata(protectedResourceMetadata(context.deps.config)))
}

export function handleAuthorizationServer(context: RouteContext): Promise<Response> {
  return Promise.resolve(metadata(authorizationServerMetadata(context.deps.config)))
}
