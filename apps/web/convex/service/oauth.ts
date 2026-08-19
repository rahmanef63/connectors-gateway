/**
 * Gateway-facing half of the OAuth authorization server — docs/18-oauth.md.
 * "service/oauth:registerClient" and "service/oauth:redeemCode".
 *
 * The human-facing half (consent, code issue) is `features/oauth`, because it
 * runs as the signed-in user. These two run as the gateway process and touch no
 * session at all.
 *
 * Both are mutations, and `redeemCode` being one is the point: verifying PKCE,
 * deleting the code and minting the token happen in a SINGLE Convex
 * transaction. Split across a query and a mutation, two concurrent exchanges
 * could both read the same unspent code, and a stolen code would be worth a
 * second token to whoever redeemed it fastest.
 */
import { v } from "convex/values"
import {
  grantedScopes,
  normalizeMcpResourceUri,
  normalizeMcpScopes,
  normalizeOAuthApplicationType,
} from "@cg/core"
import { TOKEN_PREFIXES, formatToken, hashSecret, newCredentialSecret } from "@cg/auth"
import { mutation } from "../_generated/server"
import type { MutationCtx } from "../_generated/server"
import { requireService } from "../_shared/auth"
import { deriveCodeChallenge, hashAuthorizationCode, isValidCodeVerifier } from "../_shared/code_hash"
import { timingSafeEqual } from "../_shared/constant_time"
import { fail } from "../_shared/errors"
import {
  MAX_OAUTH_CLIENT_NAME_LENGTH,
  MAX_OAUTH_TOKENS_SCANNED,
  MAX_REDIRECT_URIS,
  OAUTH_TOKEN_TTL_MS,
} from "../_shared/limits"
import { assertRedirectUri } from "../_shared/redirect_uri"

const API_KEY_ID_PREFIX = "key"
const CLIENT_ID_PREFIX = "cgc"

/**
 * RFC 7591 dynamic client registration — open, by necessity.
 *
 * Neither claude.ai's connector form nor ChatGPT's connection modal has a field
 * to paste a client id into, so a server that will not register a client cannot
 * be connected from either. The exposure this accepts is rows: anyone can
 * create one. It is bounded to that, because a client row grants NOTHING on its
 * own — no token, no user, no read. Authority arrives only when a signed-in
 * human approves a consent screen that names this client, and the code is then
 * only ever delivered to a redirect URI fixed at this moment.
 */
export const registerClient = mutation({
  args: {
    serviceToken: v.string(),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    applicationType: v.optional(v.string()),
    issuer: v.optional(v.string()),
  },
  returns: v.object({
    clientId: v.string(),
    clientName: v.string(),
    redirectUris: v.array(v.string()),
    applicationType: v.union(v.literal("web"), v.literal("native")),
    issuer: v.optional(v.string()),
    createdAt: v.number(),
  }),
  handler: async (ctx, args) => {
    requireService(ctx, args.serviceToken)

    if (args.redirectUris.length === 0) {
      fail("INVALID_INPUT", "At least one redirect URI is required.")
    }
    if (args.redirectUris.length > MAX_REDIRECT_URIS) {
      fail("INVALID_INPUT", "Too many redirect URIs.")
    }
    // Every URI is validated; one bad entry rejects the registration rather
    // than being dropped, so a client never believes it registered a URI that
    // was silently discarded and then fails at redirect time.
    const redirectUris = args.redirectUris.map(assertRedirectUri)

    const clientName = args.clientName.trim().slice(0, MAX_OAUTH_CLIENT_NAME_LENGTH)
    if (clientName.length === 0) fail("INVALID_INPUT", "A client name is required.")
    const applicationType = normalizeOAuthApplicationType(args.applicationType ?? "web")
    if (applicationType === null) fail("INVALID_INPUT", "Unsupported application type.")
    let issuer: string | undefined
    if (args.issuer !== undefined) {
      const normalizedIssuer = normalizeMcpResourceUri(args.issuer)
      if (normalizedIssuer === null) {
        fail("INVALID_INPUT", "A valid authorization-server issuer is required.")
      }
      issuer = normalizedIssuer
    }

    const clientId = `${CLIENT_ID_PREFIX}_${crypto.randomUUID().replaceAll("-", "")}`
    const createdAt = Date.now()
    await ctx.db.insert("oauthClients", {
      clientId,
      clientName,
      redirectUris,
      applicationType,
      ...(issuer === undefined ? {} : { issuer }),
      createdAt,
    })
    return {
      clientId,
      clientName,
      redirectUris,
      applicationType,
      ...(issuer === undefined ? {} : { issuer }),
      createdAt,
    }
  },
})

/**
 * Exchange an authorization code for an access token.
 *
 * Every failure returns the SAME error. A token endpoint that distinguishes
 * "no such code" from "wrong verifier" from "wrong client" is an oracle for
 * probing which of a stolen code's parameters is wrong.
 */
export const redeemCode = mutation({
  args: {
    serviceToken: v.string(),
    code: v.string(),
    codeVerifier: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    resource: v.optional(v.string()),
    issuer: v.optional(v.string()),
  },
  /**
   * A rejection is RETURNED, not thrown — and that is load-bearing, not a
   * style choice.
   *
   * A Convex mutation is one transaction: throwing rolls the whole thing back,
   * including the `delete` below. An earlier version of this function deleted
   * the code first and then threw on a bad verifier, believing it had burned
   * the code; the rollback quietly restored the row, leaving a stolen code
   * available for another attempt. Returning `{ok: false}` commits the delete.
   *
   * The gateway turns `ok: false` into a single `invalid_grant`, so the caller
   * still cannot tell which check failed.
   */
  returns: v.union(
    v.object({
      ok: v.literal(true),
      accessToken: v.string(),
      expiresIn: v.number(),
      scopes: v.array(v.string()),
    }),
    v.object({ ok: v.literal(false) }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; accessToken: string; expiresIn: number; scopes: string[] }
    | { ok: false }
  > => {
    // Still a throw: a bad service token means the GATEWAY is unauthenticated,
    // which is not a statement about anybody's authorization grant.
    requireService(ctx, args.serviceToken)

    const invalid = { ok: false } as const
    // Checked before the lookup, so a malformed verifier cannot consume a code
    // it was never presented against.
    if (!isValidCodeVerifier(args.codeVerifier)) return invalid

    const codeHash = await hashAuthorizationCode(args.code)
    const row = await ctx.db
      .query("oauthCodes")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", codeHash))
      .first()
    if (row === null) return invalid

    // Single-use from this point on, pass or fail. Every `return invalid` below
    // commits this delete along with it.
    await ctx.db.delete(row._id)

    if (row.expiresAt <= Date.now()) return invalid
    // The code was issued to one client for one redirect URI; both are re-checked
    // (RFC 6749 §4.1.3) so a code intercepted from one client cannot be redeemed
    // by another that merely knows its own id.
    if (!timingSafeEqual(row.clientId, args.clientId)) return invalid
    if (!timingSafeEqual(row.redirectUri, args.redirectUri)) return invalid

    const presented = await deriveCodeChallenge(args.codeVerifier)
    if (!timingSafeEqual(presented, row.codeChallenge)) return invalid

    const resource = normalizeMcpResourceUri(args.resource ?? row.resource)
    if (resource === null) return invalid
    const issuer = normalizeMcpResourceUri(args.issuer ?? row.issuer)
    if (issuer === null) return invalid
    if (row.issuer !== undefined && normalizeMcpResourceUri(row.issuer) !== issuer) return invalid
    if (row.resource !== undefined && normalizeMcpResourceUri(row.resource) !== resource) return invalid

    const scopes = normalizeMcpScopes(row.scopes ?? grantedScopes())
    if (scopes === null) return invalid

    const client = await ctx.db
      .query("oauthClients")
      .withIndex("by_clientId", (q) => q.eq("clientId", row.clientId))
      .first()
    if (client === null) return invalid
    if (client.issuer !== undefined && normalizeMcpResourceUri(client.issuer) !== issuer) return invalid

    // Stamped only on success, and this is the field the sweeper reads: a client
    // that has completed a flow is one somebody uses, and is never pruned.
    await ctx.db.patch(client._id, {
      lastUsedAt: Date.now(),
      ...(client.issuer === undefined ? { issuer } : {}),
    })

    const issued = await issueAccessToken(ctx, {
      userId: row.userId,
      clientId: row.clientId,
      clientName: client.clientName,
      audience: resource,
      scopes,
    })
    return { ok: true, ...issued }
  },
})

/**
 * Mint the token as an ordinary `apiKeys` row.
 *
 * This is the whole reason the transport needed no second credential type: an
 * OAuth grant IS a user-scoped, expiring API key, so `authenticateCaller` reads
 * it with no new branch, and the dashboard lists and revokes it with no new
 * screen. A separate token table would have duplicated all three.
 */
async function issueAccessToken(
  ctx: MutationCtx,
  grant: {
    userId: string
    clientId: string
    clientName: string
    audience: string
    scopes: string[]
  },
): Promise<{ accessToken: string; expiresIn: number; scopes: string[] }> {
  await revokePriorGrants(ctx, grant.userId, grant.clientId)

  const keyId = `${API_KEY_ID_PREFIX}_${crypto.randomUUID().replaceAll("-", "")}`
  const secret = newCredentialSecret()
  let accessToken: string
  let secretHash: string
  try {
    accessToken = formatToken(TOKEN_PREFIXES.apiKey, keyId, secret)
    secretHash = await hashSecret(secret)
  } catch {
    // @cg/auth throws GatewayError, which does not survive the Convex wire.
    fail("INTERNAL", "Could not issue an access token.")
  }

  const expiresAt = Date.now() + OAUTH_TOKEN_TTL_MS
  await ctx.db.insert("apiKeys", {
    keyId,
    userId: grant.userId,
    // The exact set the user approved for this authorization request.
    scopes: grant.scopes,
    secretHash,
    status: "active",
    label: grant.clientName,
    expiresAt,
    clientId: grant.clientId,
    audience: grant.audience,
  })

  return {
    accessToken,
    expiresIn: Math.floor(OAUTH_TOKEN_TTL_MS / 1000),
    scopes: [...grant.scopes],
  }
}

/**
 * One live token per (user, client). Reconnecting a host REPLACES its previous
 * token instead of adding one, which both matches what a user expects from
 * "reconnect" and stops repeated consents from growing the table without bound.
 * Other clients' tokens are untouched — revoking Claude must not sign out
 * ChatGPT.
 */
async function revokePriorGrants(
  ctx: MutationCtx,
  userId: string,
  clientId: string,
): Promise<void> {
  const rows = await ctx.db
    .query("apiKeys")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(MAX_OAUTH_TOKENS_SCANNED)
  for (const row of rows) {
    if (row.clientId !== clientId || row.status !== "active") continue
    await ctx.db.patch(row._id, { status: "revoked" })
  }
}
