/**
 * The composition root. Every port is bound to exactly one implementation here
 * and nowhere else, which is what lets the pipeline and the relay be tested
 * against in-memory fakes without a single conditional in production code.
 */
import { open } from "@cg/auth"
import { careerpackAdapter } from "@cg/adapter-careerpack"
import { createCloudExecutor, createLocalExecutor, createRouter } from "@cg/executor"
import type { CloudAdapter } from "@cg/executor"
import { createLogger } from "@cg/observability"
import type { Logger } from "@cg/observability"
import { signJob } from "@cg/protocol"
import type { JobEnvelope } from "@cg/protocol"
import type { GatewayConfig } from "./config"
import type { GatewayDeps } from "./deps"
import { createRateLimiter } from "./http/rate-limit"
import { createBuiltInRegistry } from "./registry"
import { createRelay } from "./relay/relay"
import { resolveSecrets } from "./secrets"
import { createConvexControlPlane } from "./store/convex"
import type { GatewayControlPlane } from "./store/convex"

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
  config: GatewayConfig
  deps: GatewayDeps
  logger: Logger
  stop(): void
}

export type AppOverrides = {
  logger?: Logger
  controlPlane?: GatewayControlPlane
}

export async function createApp(
  config: GatewayConfig,
  overrides: AppOverrides = {},
): Promise<GatewayApp> {
  const logger = overrides.logger ?? createLogger("gateway")
  const controlPlane =
    overrides.controlPlane ??
    createConvexControlPlane({ url: config.convexUrl, serviceToken: config.serviceToken, logger })

  const registry = createBuiltInRegistry()
  const secrets = await resolveSecrets(config, logger)

  const relay = createRelay({
    devices: controlPlane.devices,
    logger: logger.child({ scope: "relay" }),
    signingPublicKey: secrets.signingPublicKey,
    keyId: secrets.keyId,
  })

  // Cloud adapters run IN this process. Local adapters never do: blender's
  // manifest is registered for catalog/policy (./registry), and its adapter is
  // deliberately not even imported here — it executes inside apps/agent.
  const adapters = new Map<string, CloudAdapter>([
    [careerpackAdapter.manifest.id, careerpackAdapter as CloudAdapter],
  ])

  const cloud = createCloudExecutor({
    adapters,
    connections: controlPlane.connections,
    // The ONLY place a stored connection token is decrypted.
    openCredential: (tokenCipher: string) => open(tokenCipher, secrets.credentialKey),
  })
  const local = createLocalExecutor({
    devices: controlPlane.devices,
    dispatcher: relay.dispatcher,
    signJob: (envelope: JobEnvelope) =>
      signJob(envelope, { privateKey: secrets.signingPrivateKey, keyId: secrets.keyId }),
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

  return { config, deps, logger, stop: () => relay.stop() }
}
