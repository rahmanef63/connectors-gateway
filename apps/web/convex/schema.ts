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
 * (`tokenCipher`, `renewalCipher`). The gateway owns every key.
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
    /**
     * Absent for a key a human minted in the dashboard: those are revoked, not
     * aged out. Always set for an OAuth-issued token, because a grant the user
     * approved once must not stay live forever — `authenticateCaller` already
     * refuses a key past this instant, so expiry needs no sweeper to be safe.
     */
    expiresAt: v.optional(v.number()),
    /** The OAuth client this token was issued to. Absent = minted by hand. */
    clientId: v.optional(v.string()),
    /** RFC 8707 audience. Present on newly issued OAuth tokens only. */
    audience: v.optional(v.string()),
  })
    .index("by_keyId", ["keyId"])
    .index("by_user", ["userId"])
    // Exact active-key cap checks without scanning a user's revoked history.
    .index("by_user_status", ["userId", "status"]),

  /**
   * OAuth clients, all self-registered through RFC 7591 (`service/oauth`).
   *
   * No secret column, and that is the design: every client here is PUBLIC. An
   * AI host runs the flow from software the user installed, so it cannot keep
   * a secret, and PKCE — not a shared secret — is what binds the code to the
   * client that asked for it. A secret stored here would be security theatre
   * that also has to be rotated.
   */
  oauthClients: defineTable({
    clientId: v.string(),
    clientName: v.string(),
    /** Exact-match allowlist. A code is only ever redirected to one of these. */
    redirectUris: v.array(v.string()),
    /** RFC 7591 application_type; optional only for pre-migration rows. */
    applicationType: v.optional(v.union(v.literal("web"), v.literal("native"))),
    /** Authorization-server issuer that owns this client_id. */
    issuer: v.optional(v.string()),
    createdAt: v.number(),
    /**
     * Set the first time this client successfully exchanges a code, and never
     * cleared. Its ABSENCE is what the sweeper prunes on: registration is open,
     * so a scanner can add rows forever, but a row that never completed a flow
     * is the only kind that is safe to assume nobody wants.
     */
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_clientId", ["clientId"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * In-flight authorization codes. Rows live for minutes and are DELETED on
   * exchange rather than flagged consumed: a code that no longer exists cannot
   * be replayed by anyone who later reads this table, and there is no state in
   * which a used code is still present and merely marked.
   *
   * Only `codeHash` is stored. The code itself exists in a URL, a browser
   * history entry and a client's memory; a leaked database dump should not add
   * to that list.
   */
  oauthCodes: defineTable({
    /** sha256 hex of the authorization code. Never the code. */
    codeHash: v.string(),
    clientId: v.string(),
    userId: v.string(),
    /** Pinned at issue and re-checked at exchange (RFC 6749 §4.1.3). */
    redirectUri: v.string(),
    /** PKCE S256 challenge. `plain` is refused at both ends. */
    codeChallenge: v.string(),
    /** Optional only for rolling compatibility with codes issued before audience binding. */
    resource: v.optional(v.string()),
    /** RFC 9207 issuer; optional only for pre-migration codes. */
    issuer: v.optional(v.string()),
    /** Optional only for rolling compatibility with codes issued before scoped consent. */
    scopes: v.optional(v.array(v.string())),
    expiresAt: v.number(),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_user", ["userId"])
    // Lets the sweeper find lapsed codes by range instead of scanning. Without
    // it, a code nobody ever redeems is never deleted by anything.
    .index("by_expiresAt", ["expiresAt"]),

  connections: defineTable({
    connectorId: v.string(),
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    authType: authTypeValidator,
    status: connectionStatusValidator,
    baseUrl: v.string(),
    /** AES-256-GCM sealed upstream access token. Only the gateway can open it. */
    tokenCipher: v.string(),
    /** Absolute epoch milliseconds from the upstream token response. */
    tokenExpiresAt: v.optional(v.number()),
    /** Sealed refresh token or client credentials plus non-secret grant metadata. */
    renewalCipher: v.optional(v.string()),
    /** CAS generation for multi-instance refresh commits. Optional for legacy rows. */
    credentialVersion: v.optional(v.number()),
    /** Short-lived refresh owner; never a credential. */
    refreshLeaseId: v.optional(v.string()),
    refreshLeaseUntil: v.optional(v.number()),
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

  /**
   * One pending or resolved approval for ONE call.
   *
   * `requestHash` is what makes this a gate rather than a formality: it covers
   * the connector, the action AND the canonicalised input, so approving
   * "delete issue 5" cannot be replayed as "delete issue 500". An approval that
   * were merely per-action would be a standing grant wearing a confirmation
   * screen's clothes.
   *
   * Single-use and short-lived by construction: `status` moves to `consumed`
   * inside the same mutation that authorises the call, and `expiresAt` ends the
   * window whether or not anyone looked at it.
   */
  approvals: defineTable({
    ownerId: v.string(),
    connectorId: v.string(),
    actionId: v.string(),
    /** sha256 over {connectorId, actionId, canonical input}. */
    requestHash: v.string(),
    /** Short, human-readable echo of the arguments for the approval screen.
     *  Never the raw input: it can carry whatever the model wrote. */
    inputPreview: v.string(),
    risk: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("consumed"),
    ),
    requestedAt: v.number(),
    expiresAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_owner_status", ["ownerId", "status"])
    // The lookup the gateway does on every gated call.
    .index("by_owner_hash", ["ownerId", "requestHash"])
    // Expired rows are inert but still need bounded storage cleanup.
    .index("by_expiresAt", ["expiresAt"]),

  /**
   * Enforced single-active-process lease.
   *
   * Relay sockets, rate buckets and agent replay state are not distributed yet.
   * A durable lease makes that topology fail closed: a second replica cannot
   * quietly double limits or own sockets the first process cannot dispatch to.
   */
  gatewayLeases: defineTable({
    leaseName: v.string(),
    holderId: v.string(),
    acquiredAt: v.number(),
    renewedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_name", ["leaseName"]),

  /** Future multi-instance shared fixed-window limiter. Raw peer addresses are never stored. */
  rateLimitBuckets: defineTable({
    bucket: v.string(),
    keyDigest: v.string(),
    count: v.number(),
    resetAt: v.number(),
  })
    .index("by_bucket_key", ["bucket", "keyDigest"])
    .index("by_resetAt", ["resetAt"]),

  relayRoutes: defineTable({
    deviceId: v.string(),
    gatewayId: v.string(),
    sessionId: v.string(),
    /** Private Docker-overlay endpoint; never returned to browser clients. */
    internalUrl: v.string(),
    updatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_device", ["deviceId"])
    .index("by_gateway", ["gatewayId"])
    .index("by_expiresAt", ["expiresAt"]),

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
