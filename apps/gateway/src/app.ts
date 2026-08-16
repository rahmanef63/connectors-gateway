/**
 * The composition root. Every port is bound to exactly one implementation here
 * and nowhere else, which is what lets the pipeline and the relay be tested
 * against in-memory fakes without a single conditional in production code.
 */
import { open } from "@cg/auth"
import { manifest as blenderManifest } from "@cg/adapter-blender"
import { REMOTE_MCP_MANIFESTS, createRemoteMcpAdapter } from "@cg/adapter-remote-mcp"
import { createCloudExecutor, createLocalExecutor, createRouter } from "@cg/executor"
import type { CloudAdapter } from "@cg/executor"
import { createLogger } from "@cg/observability"
import type { Logger } from "@cg/observability"
import { importPrivateKey, signJob } from "@cg/protocol"
import type { JobEnvelope } from "@cg/protocol"
import { createRegistry } from "@cg/registry"
import type { GatewayConfig } from "./config"
import type { GatewayDeps } from "./deps"
import { createRateLimiter } from "./http/rate-limit"
import { createRelay } from "./relay/relay"
import { createConvexControlPlane } from "./store/convex"

/** 5 code mints per 10 minutes per peer — docs/14 "pairing code brute force". */
const PAIRING_LIMIT = 5
const PAIRING_WINDOW_MS = 10 * 60_000

/**
 * Claim budget per peer. The agent polls /v1/pair/claim on a 2s→10s curve for
 * the whole 5-minute code lifetime — about 35 requests — so the old shared
 * budget of 5 was exhausted 34 seconds in and every later poll was rejected:
 * a human who took longer than half a minute to approve could never pair, and
 * was told the code "was not approved in time".
 *
 * This is not a weaker brute-force control. A challenge id is 128 bits of
 * randomness, /v1/pair/start (which is what actually creates one) is still
 * capped at 5, and every route now also passes the edge limiter below.
 */
const CLAIM_LIMIT = 60
const CLAIM_WINDOW_MS = 10 * 60_000

/**
 * Edge budget per peer (docs/03 "Apply rate limits"). Sized far above any real
 * MCP client and far below what it takes to burn a core on PBKDF2: every
 * authenticated route hashes the presented bearer token before it can know the
 * token is fake, at roughly 28ms of CPU per attempt.
 */
const EDGE_LIMIT = 120
const EDGE_WINDOW_MS = 60_000

export type GatewayApp = {
  deps: GatewayDeps
  logger: Logger
  stop(): void
}

export async function createApp(config: GatewayConfig): Promise<GatewayApp> {
  const logger = createLogger("gateway")
  const controlPlane = createConvexControlPlane({
    url: config.convexUrl,
    serviceToken: config.serviceToken,
    logger,
  })

  // Boot-time gate: a manifest that fails its own contract stops the process.
  const registry = createRegistry([...REMOTE_MCP_MANIFESTS, blenderManifest])
  const signingPrivateKey = await importPrivateKey(config.signing.privateKey)
  const keyId = config.signing.keyId

  const relay = createRelay({
    devices: controlPlane.devices,
    logger: logger.child({ scope: "relay" }),
    signingPublicKey: config.signing.publicKey,
    keyId,
  })

  // Cloud adapters run IN this process. Local adapters never do: blender
  // contributes its MANIFEST only — registered above for catalog and policy —
  // and its adapter is deliberately not even imported here, because it executes
  // inside apps/agent on the user's machine (AGENTS.md invariant 1/3).
  //
  // Every remote MCP connector is the SAME adapter bound to a different manifest, so a
  // new one is a JSON file in @cg/adapter-remote-mcp and nothing here changes.
  const adapters = new Map<string, CloudAdapter>(
    REMOTE_MCP_MANIFESTS.map((manifest) => [manifest.id, createRemoteMcpAdapter(manifest)]),
  )

  const cloud = createCloudExecutor({
    adapters,
    connections: controlPlane.connections,
    // The ONLY place a stored connection token is decrypted.
    openCredential: (tokenCipher: string) => open(tokenCipher, config.credentialEncryptionKey),
  })
  const local = createLocalExecutor({
    devices: controlPlane.devices,
    dispatcher: relay.dispatcher,
    signJob: (envelope: JobEnvelope) => signJob(envelope, { privateKey: signingPrivateKey, keyId }),
  })

  const deps: GatewayDeps = {
    config,
    registry,
    apiKeys: controlPlane.apiKeys,
    policy: controlPlane.policy,
    devices: controlPlane.devices,
    connections: controlPlane.connections,
    audit: controlPlane.audit,
    pairing: controlPlane.pairing,
    executor: createRouter({ cloud, local }),
    pairingLimiter: createRateLimiter({ limit: PAIRING_LIMIT, windowMs: PAIRING_WINDOW_MS }),
    claimLimiter: createRateLimiter({ limit: CLAIM_LIMIT, windowMs: CLAIM_WINDOW_MS }),
    edgeLimiter: createRateLimiter({ limit: EDGE_LIMIT, windowMs: EDGE_WINDOW_MS }),
    relay,
    logger,
  }

  return { deps, logger, stop: () => relay.stop() }
}
