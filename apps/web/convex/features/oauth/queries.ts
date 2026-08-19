/**
 * What the consent screen needs to know before it asks a human to approve
 * anything — docs/18-oauth.md.
 *
 * Every parameter of the incoming authorization request arrives from a URL the
 * CLIENT built, so nothing here is rendered until it has been checked against
 * the registered client. A consent screen that prints an attacker's chosen
 * `client_name`, or that renders at all for an unregistered redirect URI, is
 * how a user is talked into approving a flow whose code goes elsewhere.
 */
import { v } from "convex/values"
import { grantedScopes, normalizeMcpResourceUri, normalizeMcpScopes } from "@cg/core"
import { query } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import { isValidCodeChallenge } from "../../_shared/code_hash"
import { fail } from "../../_shared/errors"
import { isRegisteredRedirectUri } from "../../_shared/redirect_uri"

export const authorizationRequestValidator = v.object({
  clientName: v.string(),
  /** Echoed back so the page redirects to the checked value, not the raw one. */
  redirectUri: v.string(),
  resource: v.string(),
  issuer: v.string(),
  scopes: v.array(v.string()),
})

/**
 * Resolves an authorization request, or refuses it.
 *
 * Requires a signed-in user even though it reads only client data: this is the
 * page a human is looking at, and an anonymous caller has no business
 * enumerating which client ids exist.
 */
export const describeRequest = query({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
    resource: v.string(),
    issuer: v.string(),
    scopes: v.optional(v.array(v.string())),
  },
  returns: authorizationRequestValidator,
  handler: async (ctx, args) => {
    await requireUser(ctx)

    // Refused here rather than at the token endpoint. By the time a code has
    // been issued the browser has already been redirected, so an unsupported
    // method must stop the flow BEFORE a human is asked to approve it.
    if (args.codeChallengeMethod !== "S256") {
      fail("INVALID_INPUT", "This server supports PKCE S256 only.")
    }
    if (!isValidCodeChallenge(args.codeChallenge)) {
      fail("INVALID_INPUT", "The PKCE code challenge is malformed.")
    }
    const resource = normalizeMcpResourceUri(args.resource)
    if (resource === null) fail("INVALID_INPUT", "The OAuth resource is invalid.")
    const issuer = normalizeMcpResourceUri(args.issuer)
    if (issuer === null) fail("INVALID_INPUT", "The OAuth issuer is invalid.")
    const scopes = normalizeMcpScopes(args.scopes ?? grantedScopes())
    if (scopes === null) fail("INVALID_INPUT", "The requested OAuth scopes are invalid.")

    const client = await ctx.db
      .query("oauthClients")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .first()
    if (client === null) fail("INVALID_INPUT", "Unknown client.")
    if (client.issuer !== undefined && normalizeMcpResourceUri(client.issuer) !== issuer) {
      fail("INVALID_INPUT", "This client is registered with another authorization server.")
    }

    if (!isRegisteredRedirectUri(args.redirectUri, client.redirectUris)) {
      // Deliberately NOT redirected back with an error: an unregistered URI is
      // exactly the case where redirecting is the attack.
      fail("INVALID_INPUT", "This redirect URI is not registered for that client.")
    }

    return {
      clientName: client.clientName,
      redirectUri: args.redirectUri,
      resource,
      issuer,
      scopes,
    }
  },
})
