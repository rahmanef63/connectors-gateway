/**
 * The ControlPlane assembled from the Convex-backed ports.
 * One port, one production implementation (packages/core/src/store.ts).
 */
import type { ControlPlane } from "@cg/core"
import type { ApiKeyLookup } from "@cg/auth"
import type { Logger } from "@cg/observability"
import { createApiKeyLookup } from "./api-keys"
import { createApprovalStore, type ApprovalStore } from "./approvals"
import { createAuditSink } from "./audit"
import { createControlPlaneClient } from "./client"
import { createConnectionStore } from "./connections"
import { createDeviceStore } from "./devices"
import type { GatewayDeviceStore } from "./devices"
import { createOAuthStore, type OAuthStore } from "./oauth"
import { createPairingStore } from "./pairing"
import { createPolicyStore } from "./policy"

/** ControlPlane plus the two seams the ports do not cover: relay auth and caller auth. */
export type GatewayControlPlane = ControlPlane & {
  devices: GatewayDeviceStore
  apiKeys: ApiKeyLookup
  approvals: ApprovalStore
  oauth: OAuthStore
}

export function createConvexControlPlane(options: {
  url: string
  serviceToken: string
  logger: Logger
}): GatewayControlPlane {
  const client = createControlPlaneClient(options)
  return {
    devices: createDeviceStore(client),
    pairing: createPairingStore(client),
    policy: createPolicyStore(client),
    connections: createConnectionStore(client),
    audit: createAuditSink(client, options.logger),
    apiKeys: createApiKeyLookup(client),
    approvals: createApprovalStore(client),
    oauth: createOAuthStore(client),
  }
}
