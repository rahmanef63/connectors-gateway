/**
 * The ControlPlane assembled from the Convex-backed ports.
 * One port, one production implementation (packages/core/src/store.ts).
 */
import type { ControlPlane } from "@cg/core"
import type { ApiKeyLookup } from "@cg/auth"
import type { Logger } from "@cg/observability"
import { createApiKeyLookup } from "./api-keys"
import { createAuditSink } from "./audit"
import { createControlPlaneClient } from "./client"
import type { ControlPlaneClient } from "./client"
import { createConnectionStore } from "./connections"
import { createDeviceStore } from "./devices"
import type { GatewayDeviceStore } from "./devices"
import { createPairingStore } from "./pairing"
import { createPolicyStore } from "./policy"

/** ControlPlane plus the two seams the ports do not cover: relay auth and caller auth. */
export type GatewayControlPlane = ControlPlane & {
  devices: GatewayDeviceStore
  apiKeys: ApiKeyLookup
}

export function createControlPlane(client: ControlPlaneClient, logger: Logger): GatewayControlPlane {
  return {
    devices: createDeviceStore(client),
    pairing: createPairingStore(client),
    policy: createPolicyStore(client),
    connections: createConnectionStore(client),
    audit: createAuditSink(client, logger),
    apiKeys: createApiKeyLookup(client),
  }
}

export function createConvexControlPlane(options: {
  url: string
  serviceToken: string
  logger: Logger
}): GatewayControlPlane {
  return createControlPlane(createControlPlaneClient(options), options.logger)
}
