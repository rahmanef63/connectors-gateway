/**
 * Dashboard connection writes — one row per (user, connector).
 *
 * `tokenCipher` arrives ALREADY SEALED. `CREDENTIAL_ENCRYPTION_KEY` lives only
 * in the gateway process, so Convex can neither seal nor open it and must never
 * try. What it can do is refuse to store something that is obviously not a
 * sealed envelope: an unsealed token stored here would come back as an opaque
 * INTERNAL error at call time, hours later, far from the mistake.
 */
import { v } from "convex/values"
import { mutation } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import { fail } from "../../_shared/errors"
import { assertIdentifier } from "../../_shared/input"
import { MAX_CONNECTIONS_PER_CONNECTOR } from "../../_shared/limits"
import { assertUpstreamUrl } from "../../_shared/upstream_url"
import { authTypeValidator } from "../../_shared/validators"
import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"

/**
 * `v1.<ivB64url>.<cipherB64url>` — the exact output of `@cg/auth` `seal`.
 * SHAPE ONLY: without the key nothing here can verify the tag, so this proves
 * "was produced by a sealer", never "decrypts to anything".
 */
const SEALED_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/
const MAX_TOKEN_CIPHER_LENGTH = 8192

export const upsert = mutation({
  args: {
    connectorId: v.string(),
    baseUrl: v.string(),
    tokenCipher: v.string(),
    authType: authTypeValidator,
  },
  returns: v.object({ connectionId: v.string() }),
  handler: async (ctx, args): Promise<{ connectionId: string }> => {
    const userId = await requireUser(ctx)
    const connectorId = assertIdentifier(args.connectorId, "connectorId")
    // Validated before any read, so a rejected URL never touches the database.
    const baseUrl = assertUpstreamUrl(args.baseUrl)
    const tokenCipher = assertSealedEnvelope(args.tokenCipher)

    const existing = await ownedConnections(ctx, userId, connectorId)
    const current = existing[0]
    if (current !== undefined) {
      // Re-connecting is an update, not a second row: the gateway resolves one
      // credential per (owner, connector) and a duplicate would be a coin flip.
      await ctx.db.patch(current._id, {
        authType: args.authType,
        baseUrl,
        tokenCipher,
        status: "active",
      })
      return { connectionId: current._id }
    }

    const connectionId = await ctx.db.insert("connections", {
      connectorId,
      ownerType: "user",
      ownerId: userId,
      authType: args.authType,
      status: "active",
      baseUrl,
      tokenCipher,
    })
    return { connectionId }
  },
})

/**
 * Idempotent: removing a connector that is not connected succeeds silently.
 * Reporting "not found" would turn this into an existence oracle, and the
 * caller's intent — "this connector must not be connected" — is satisfied
 * either way. Ownership comes from the session, so another user's row is not
 * reachable through this function at all.
 */
export const remove = mutation({
  args: { connectorId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await requireUser(ctx)
    const connectorId = assertIdentifier(args.connectorId, "connectorId")
    for (const connection of await ownedConnections(ctx, userId, connectorId)) {
      await ctx.db.delete(connection._id)
    }
    return null
  },
})

/** Bounded index read — the owner is the session user, never an argument. */
async function ownedConnections(
  ctx: MutationCtx,
  userId: string,
  connectorId: string,
): Promise<Doc<"connections">[]> {
  return await ctx.db
    .query("connections")
    .withIndex("by_owner_connector", (q) =>
      q.eq("ownerType", "user").eq("ownerId", userId).eq("connectorId", connectorId),
    )
    .take(MAX_CONNECTIONS_PER_CONNECTOR)
}

function assertSealedEnvelope(value: string): string {
  if (value.length > MAX_TOKEN_CIPHER_LENGTH || !SEALED_PATTERN.test(value)) {
    // No echo of the value: it is credential material even when malformed.
    fail("INVALID_INPUT", "Credential is not a sealed envelope.")
  }
  return value
}
