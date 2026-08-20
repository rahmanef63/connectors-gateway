/**
 * PINNED cross-process contract with apps/web/convex.
 *
 * The gateway cannot import `apps/web/convex/_generated`, so every control-plane
 * call is addressed by function-reference STRING. These strings and their arg
 * shapes are the contract; both sides must match exactly. Return types are
 * deliberately `unknown` — a Convex response is external input and is re-checked
 * by ./guards before anything reads a field off it.
 *
 * Every `service/*` function takes `serviceToken: v.string()` and calls
 * `requireService` as its first statement.
 */
import { makeFunctionReference } from "convex/server"
import type { DevicePlatform } from "@cg/core"

type Q<A extends Record<string, unknown>> = ReturnType<typeof makeFunctionReference<"query", A, unknown>>
type M<A extends Record<string, unknown>> = ReturnType<typeof makeFunctionReference<"mutation", A, unknown>>

function query<A extends Record<string, unknown>>(name: string): Q<A> {
  return makeFunctionReference<"query", A, unknown>(name)
}

function mutation<A extends Record<string, unknown>>(name: string): M<A> {
  return makeFunctionReference<"mutation", A, unknown>(name)
}

type WithToken<T> = T & { serviceToken: string }

export const REFS = {
  devicesGetRecord: query<WithToken<{ deviceId: string }>>("service/devices:getRecord"),
  devicesListForUser: query<WithToken<{ userId: string }>>("service/devices:listForUser"),
  devicesSetPresence: mutation<
    WithToken<{ deviceId: string; online: boolean; capabilities?: string[] }>
  >("service/devices:setPresence"),

  pairingCreateChallenge: mutation<
    WithToken<{
      id: string
      code: string
      deviceName: string
      platform: DevicePlatform
      expiresAt: number
    }>
  >("service/pairing:createChallenge"),
  pairingGetByCode: query<WithToken<{ code: string }>>("service/pairing:getByCode"),
  pairingClaim: mutation<
    WithToken<{ challengeId: string; deviceId: string; credentialHash: string }>
  >("service/pairing:claim"),

  approvalsClaim: mutation<WithToken<{ ownerId: string; requestHash: string }>>(
    "service/approvals:claim",
  ),
  approvalsRequest: mutation<
    WithToken<{
      ownerId: string
      connectorId: string
      actionId: string
      requestHash: string
      inputPreview: string
      risk: string
    }>
  >("service/approvals:request"),

  policyListRules: query<WithToken<{ userId: string; connectorId: string }>>(
    "service/policy:listRules",
  ),

  connectionsListForUser: query<WithToken<{ userId: string }>>("service/connections:listForUser"),
  connectionsResolveCredential: query<WithToken<{ userId: string; connectorId: string }>>(
    "service/connections:resolveCredential",
  ),
  connectionsBeginRefresh: mutation<
    WithToken<{
      userId: string
      connectorId: string
      connectionId: string
      leaseId: string
    }>
  >("service/connections:beginRefresh"),
  connectionsFinishRefresh: mutation<
    WithToken<{
      userId: string
      connectorId: string
      connectionId: string
      expectedVersion: number
      leaseId: string
      tokenCipher: string
      tokenExpiresAt?: number
      renewalCipher: string
    }>
  >("service/connections:finishRefresh"),
  connectionsAbortRefresh: mutation<
    WithToken<{
      userId: string
      connectorId: string
      connectionId: string
      expectedVersion: number
      leaseId: string
      permanent: boolean
    }>
  >("service/connections:abortRefresh"),

  gatewayLeaseAcquire: mutation<WithToken<{ holderId: string }>>(
    "service/gateway_lease:acquire",
  ),
  gatewayLeaseRenew: mutation<WithToken<{ holderId: string }>>(
    "service/gateway_lease:renew",
  ),
  gatewayLeaseRelease: mutation<WithToken<{ holderId: string }>>(
    "service/gateway_lease:release",
  ),

  rateLimitsConsume: mutation<WithToken<{
    bucket: string
    keyDigest: string
    limit: number
    windowMs: number
  }>>("service/rate_limits:consume"),

  relayRoutesClaim: mutation<WithToken<{
    deviceId: string
    gatewayId: string
    sessionId: string
    internalUrl: string
  }>>("service/relay_routes:claim"),
  relayRoutesRefresh: mutation<WithToken<{ deviceId: string; gatewayId: string; sessionId: string }>>(
    "service/relay_routes:refresh",
  ),
  relayRoutesRelease: mutation<WithToken<{ deviceId: string; gatewayId: string; sessionId: string }>>(
    "service/relay_routes:release",
  ),
  relayRoutesResolve: query<WithToken<{ deviceId: string }>>("service/relay_routes:resolve"),

  auditAppend: mutation<WithToken<{ event: Record<string, unknown> }>>("service/audit:append"),

  apiKeysGetRecord: query<WithToken<{ keyId: string }>>("service/apiKeys:getRecord"),

  oauthRegisterClient: mutation<WithToken<{ clientName: string; redirectUris: string[] }>>(
    "service/oauth:registerClient",
  ),
  oauthRedeemCode: mutation<
    WithToken<{ code: string; codeVerifier: string; clientId: string; redirectUri: string }>
  >("service/oauth:redeemCode"),
} as const
