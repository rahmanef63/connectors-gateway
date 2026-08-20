/**
 * Gateway-facing connection store — docs/08-auth-and-identity.md.
 *
 * Access and renewal credentials remain AES-GCM ciphertext throughout Convex.
 * The gateway coordinates refresh with a short lease and credential generation;
 * only the lease/version are readable here, so two gateway instances cannot
 * overwrite one another's rotated refresh token.
 */
import { type Infer, v } from "convex/values"
import { OAUTH_REFRESH_LEASE_MS, OAUTH_REFRESH_SKEW_MS } from "@cg/core"
import { mutation, query } from "../_generated/server"
import type { Doc } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { requireService } from "../_shared/auth"
import {
  connectionRecordValidator,
  credentialValidator,
  toConnectionRecord,
  toCredential,
  type ConnectionRecord,
  type CredentialRecord,
} from "../_shared/connection_record"
import {
  MAX_CONNECTIONS_PER_CONNECTOR,
  MAX_CONNECTIONS_PER_OWNER,
} from "../_shared/limits"
import { assertSealedEnvelope } from "../_shared/sealed_envelope"

const refreshDecisionValidator = v.union(
  v.object({ state: v.literal("ready"), credential: credentialValidator }),
  v.object({ state: v.literal("refresh"), credential: credentialValidator }),
  v.object({ state: v.literal("wait"), retryAfterMs: v.number() }),
  v.object({ state: v.literal("missing") }),
)
type RefreshDecision = Infer<typeof refreshDecisionValidator>

const updateResultValidator = v.object({ updated: v.boolean() })
type UpdateResult = Infer<typeof updateResultValidator>

export const listForUser = query({
  args: { serviceToken: v.string(), userId: v.string() },
  returns: v.array(connectionRecordValidator),
  handler: async (ctx, args): Promise<ConnectionRecord[]> => {
    requireService(ctx, args.serviceToken)
    const connections = await ctx.db
      .query("connections")
      .withIndex("by_owner", (q) => q.eq("ownerType", "user").eq("ownerId", args.userId))
      .take(MAX_CONNECTIONS_PER_OWNER)
    return connections.map(toConnectionRecord)
  },
})

/** Only an `active` connection resolves. Expiry is handled by `beginRefresh`,
 * because a query cannot atomically mark an unrenewable row expired. */
export const resolveCredential = query({
  args: { serviceToken: v.string(), userId: v.string(), connectorId: v.string() },
  returns: v.union(credentialValidator, v.null()),
  handler: async (ctx, args): Promise<CredentialRecord | null> => {
    requireService(ctx, args.serviceToken)
    const connection = await activeOwnedConnection(ctx, args.userId, args.connectorId)
    return connection === undefined ? null : toCredential(connection)
  },
})

/**
 * Atomically decide whether this call may use the current token, should wait for
 * another gateway, or owns the one refresh attempt for this credential version.
 */
export const beginRefresh = mutation({
  args: {
    serviceToken: v.string(),
    userId: v.string(),
    connectorId: v.string(),
    connectionId: v.string(),
    leaseId: v.string(),
  },
  returns: refreshDecisionValidator,
  handler: async (ctx, args): Promise<RefreshDecision> => {
    requireService(ctx, args.serviceToken)
    const leaseId = assertLeaseId(args.leaseId)
    const connection = await exactActiveConnection(
      ctx,
      args.userId,
      args.connectorId,
      args.connectionId,
    )
    if (connection === undefined) return { state: "missing" }

    const now = Date.now()
    const expiresAt = connection.tokenExpiresAt
    if (expiresAt === undefined || expiresAt > now + OAUTH_REFRESH_SKEW_MS) {
      return { state: "ready", credential: toCredential(connection) }
    }

    if (connection.renewalCipher === undefined) {
      // An access token that still has a few seconds left remains usable. Once
      // expired, make the reconnect requirement visible in the dashboard.
      if (expiresAt > now) return { state: "ready", credential: toCredential(connection) }
      await ctx.db.patch(connection._id, {
        status: "expired",
        refreshLeaseId: undefined,
        refreshLeaseUntil: undefined,
      })
      return { state: "missing" }
    }

    if (
      connection.refreshLeaseId !== undefined &&
      connection.refreshLeaseId !== leaseId &&
      (connection.refreshLeaseUntil ?? 0) > now
    ) {
      return {
        state: "wait",
        retryAfterMs: Math.max(1, (connection.refreshLeaseUntil ?? now + 1) - now),
      }
    }

    await ctx.db.patch(connection._id, {
      refreshLeaseId: leaseId,
      refreshLeaseUntil: now + OAUTH_REFRESH_LEASE_MS,
    })
    return { state: "refresh", credential: toCredential(connection) }
  },
})

/** CAS commit: only the lease holder for the exact credential generation wins. */
export const finishRefresh = mutation({
  args: {
    serviceToken: v.string(),
    userId: v.string(),
    connectorId: v.string(),
    connectionId: v.string(),
    expectedVersion: v.number(),
    leaseId: v.string(),
    tokenCipher: v.string(),
    tokenExpiresAt: v.optional(v.number()),
    renewalCipher: v.string(),
  },
  returns: updateResultValidator,
  handler: async (ctx, args): Promise<UpdateResult> => {
    requireService(ctx, args.serviceToken)
    const leaseId = assertLeaseId(args.leaseId)
    const tokenCipher = assertSealedEnvelope(args.tokenCipher)
    const renewalCipher = assertSealedEnvelope(args.renewalCipher)
    const tokenExpiresAt = assertOptionalTimestamp(args.tokenExpiresAt)
    const connection = await exactActiveConnection(
      ctx,
      args.userId,
      args.connectorId,
      args.connectionId,
    )
    if (
      connection === undefined ||
      (connection.credentialVersion ?? 1) !== args.expectedVersion ||
      connection.refreshLeaseId !== leaseId
    ) {
      return { updated: false }
    }

    await ctx.db.patch(connection._id, {
      tokenCipher,
      tokenExpiresAt,
      renewalCipher,
      credentialVersion: args.expectedVersion + 1,
      refreshLeaseId: undefined,
      refreshLeaseUntil: undefined,
      status: "active",
    })
    return { updated: true }
  },
})

/** Release a transient failure, or require reconnect after invalid_grant/client. */
export const abortRefresh = mutation({
  args: {
    serviceToken: v.string(),
    userId: v.string(),
    connectorId: v.string(),
    connectionId: v.string(),
    expectedVersion: v.number(),
    leaseId: v.string(),
    permanent: v.boolean(),
  },
  returns: updateResultValidator,
  handler: async (ctx, args): Promise<UpdateResult> => {
    requireService(ctx, args.serviceToken)
    const leaseId = assertLeaseId(args.leaseId)
    const connection = await exactActiveConnection(
      ctx,
      args.userId,
      args.connectorId,
      args.connectionId,
    )
    if (
      connection === undefined ||
      (connection.credentialVersion ?? 1) !== args.expectedVersion ||
      connection.refreshLeaseId !== leaseId
    ) {
      return { updated: false }
    }

    await ctx.db.patch(connection._id, {
      ...(args.permanent ? { status: "expired" as const } : {}),
      refreshLeaseId: undefined,
      refreshLeaseUntil: undefined,
    })
    return { updated: true }
  },
})

async function activeOwnedConnection(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  connectorId: string,
): Promise<Doc<"connections"> | undefined> {
  const rows = await ctx.db
    .query("connections")
    .withIndex("by_owner_connector", (q) =>
      q.eq("ownerType", "user").eq("ownerId", userId).eq("connectorId", connectorId),
    )
    .take(MAX_CONNECTIONS_PER_CONNECTOR)
  return rows.find((row) => row.status === "active")
}

async function exactActiveConnection(
  ctx: MutationCtx,
  userId: string,
  connectorId: string,
  connectionId: string,
): Promise<Doc<"connections"> | undefined> {
  const connection = await activeOwnedConnection(ctx, userId, connectorId)
  return connection !== undefined && connection._id === connectionId ? connection : undefined
}

function assertLeaseId(value: string): string {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) throw new Error("Invalid refresh lease.")
  return value
}

function assertOptionalTimestamp(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid token expiry.")
  return value
}
