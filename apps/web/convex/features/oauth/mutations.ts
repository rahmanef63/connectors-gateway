/**
 * The moment consent becomes a credential — docs/18-oauth.md.
 *
 * `approve` runs as the SIGNED-IN USER, and the user id on the code comes from
 * the session, never from an argument. That is the single most important line
 * in this file: if the caller could name the user, any client could mint a code
 * for anybody.
 */
import { v } from "convex/values"
import { toHex } from "@cg/auth"
import { mutation } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import { hashAuthorizationCode, isValidCodeChallenge } from "../../_shared/code_hash"
import { fail } from "../../_shared/errors"
import { OAUTH_CODE_TTL_MS } from "../../_shared/limits"
import { isRegisteredRedirectUri } from "../../_shared/redirect_uri"

/**
 * Issue an authorization code for this user and this client.
 *
 * Re-validates the client and the redirect URI even though `describeRequest`
 * already did: that was a query rendering a page, and nothing stops a caller
 * from POSTing straight here with different arguments. The check that matters
 * is the one on the write path.
 */
export const approve = mutation({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
  },
  returns: v.object({ code: v.string() }),
  handler: async (ctx, args): Promise<{ code: string }> => {
    const userId = await requireUser(ctx)

    if (args.codeChallengeMethod !== "S256") {
      fail("INVALID_INPUT", "This server supports PKCE S256 only.")
    }
    if (!isValidCodeChallenge(args.codeChallenge)) {
      fail("INVALID_INPUT", "The PKCE code challenge is malformed.")
    }

    const client = await ctx.db
      .query("oauthClients")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .first()
    if (client === null) fail("INVALID_INPUT", "Unknown client.")
    if (!isRegisteredRedirectUri(args.redirectUri, client.redirectUris)) {
      fail("INVALID_INPUT", "This redirect URI is not registered for that client.")
    }

    // 256 bits from the CSPRNG. The code is a bearer secret for the next two
    // minutes, so it is generated here and only its digest is written.
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const code = toHex(bytes)

    await ctx.db.insert("oauthCodes", {
      codeHash: await hashAuthorizationCode(code),
      clientId: args.clientId,
      userId,
      redirectUri: args.redirectUri,
      codeChallenge: args.codeChallenge,
      expiresAt: Date.now() + OAUTH_CODE_TTL_MS,
    })

    // Returned once, to the browser that is about to carry it to the client.
    return { code }
  },
})
