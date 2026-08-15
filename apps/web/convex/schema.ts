/**
 * Control-plane schema. Tables follow docs/04-device-pairing.md,
 * docs/08-auth-and-identity.md, docs/09-policy-and-approvals.md and
 * docs/10-observability.md.
 *
 * Identity contract: `deviceId`, `challengeId`, `keyId`, `userId` and
 * `requestId` are gateway-minted opaque strings (`@cg/core` `newId`), never
 * Convex document ids. The gateway hashes a device credential *before* the
 * device row exists, so it has to mint the id — see `service/pairing:claim`.
 *
 * Secrets: this schema stores only opaque material — PBKDF2 hashes
 * (`credentialHash`, `secretHash`) and AES-256-GCM ciphertext
 * (`tokenCipher`). The gateway owns every key.
 */
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"
import {
  apiKeyStatusValidator,
  auditStatusValidator,
  authTypeValidator,
  challengeStatusValidator,
  connectionStatusValidator,
  deviceStatusValidator,
  errorCodeValidator,
  executorKindValidator,
  ownerTypeValidator,
  platformValidator,
  policyDecisionValidator,
} from "./_shared/validators"

export default defineSchema({
  ...authTables,

  devices: defineTable({
    deviceId: v.string(),
    userId: v.string(),
    workspaceId: v.optional(v.string()),
    displayName: v.string(),
    platform: platformValidator,
    status: deviceStatusValidator,
    /** PBKDF2-SHA256 of the device credential. Never returned to a client. */
    credentialHash: v.string(),
    credentialVersion: v.number(),
    capabilities: v.array(v.string()),
    lastSeenAt: v.optional(v.number()),
  })
    // by_deviceId is not in the original table sketch but is required: the
    // gateway addresses devices by its own id, so every point read needs it.
    .index("by_deviceId", ["deviceId"])
    .index("by_user", ["userId"])
    .index("by_status_user", ["status", "userId"]),

  pairingChallenges: defineTable({
    challengeId: v.string(),
    code: v.string(),
    deviceName: v.string(),
    platform: platformValidator,
    status: challengeStatusValidator,
    expiresAt: v.number(),
    userId: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_code", ["code"])
    .index("by_user", ["userId"]),

  apiKeys: defineTable({
    keyId: v.string(),
    userId: v.string(),
    workspaceId: v.optional(v.string()),
    scopes: v.array(v.string()),
    /** PBKDF2-SHA256 of the API key secret. Never returned to a client. */
    secretHash: v.string(),
    status: apiKeyStatusValidator,
    label: v.string(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_keyId", ["keyId"])
    .index("by_user", ["userId"]),

  connections: defineTable({
    connectorId: v.string(),
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    authType: authTypeValidator,
    status: connectionStatusValidator,
    baseUrl: v.string(),
    /** AES-256-GCM sealed upstream token. Only the gateway can open it. */
    tokenCipher: v.string(),
  })
    .index("by_owner", ["ownerType", "ownerId"])
    .index("by_owner_connector", ["ownerType", "ownerId", "connectorId"]),

  policyRules: defineTable({
    userId: v.string(),
    connectorId: v.string(),
    /** Action id, or `*` for every action of the connector. */
    actionId: v.string(),
    decision: policyDecisionValidator,
  }).index("by_user_connector", ["userId", "connectorId"]),

  auditLogs: defineTable({
    requestId: v.string(),
    timestamp: v.number(),
    actorId: v.string(),
    userId: v.string(),
    workspaceId: v.optional(v.string()),
    connectorId: v.string(),
    actionId: v.string(),
    executorKind: executorKindValidator,
    deviceId: v.optional(v.string()),
    connectionId: v.optional(v.string()),
    policyDecision: policyDecisionValidator,
    status: auditStatusValidator,
    latencyMs: v.number(),
    errorCode: v.optional(errorCodeValidator),
  }).index("by_user_time", ["userId", "timestamp"]),
})
