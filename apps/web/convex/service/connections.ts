/**
 * Gateway-facing connection store — docs/08-auth-and-identity.md.
 * "service/connections:listForUser" / ":resolveCredential".
 *
 * `resolveCredential` returns CIPHERTEXT. Convex never holds
 * `CREDENTIAL_ENCRYPTION_KEY`; the gateway opens the sealed token immediately
 * before an adapter call and never puts the plaintext back on the wire.
 */
import { v } from "convex/values"
import { query } from "../_generated/server"
import { requireService } from "../_shared/auth"
import {
  connectionRecordValidator,
  credentialValidator,
  toConnectionRecord,
  toCredential,
  type ConnectionRecord,
  type CredentialRecord,
} from "../_shared/connection_record"
import { MAX_CONNECTIONS_PER_CONNECTOR, MAX_CONNECTIONS_PER_OWNER } from "../_shared/limits"

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

/** Only an `active` connection resolves — expired/revoked/error is a miss, so
 * the gateway raises CONNECTION_MISSING instead of calling upstream. */
export const resolveCredential = query({
  args: { serviceToken: v.string(), userId: v.string(), connectorId: v.string() },
  returns: v.union(credentialValidator, v.null()),
  handler: async (ctx, args): Promise<CredentialRecord | null> => {
    requireService(ctx, args.serviceToken)
    const rows = await ctx.db
      .query("connections")
      .withIndex("by_owner_connector", (q) =>
        q.eq("ownerType", "user").eq("ownerId", args.userId).eq("connectorId", args.connectorId),
      )
      .take(MAX_CONNECTIONS_PER_CONNECTOR)
    const connection = rows.find((row) => row.status === "active")
    return connection === undefined ? null : toCredential(connection)
  },
})
