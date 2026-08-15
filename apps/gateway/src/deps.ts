/**
 * The wired dependency set every HTTP handler receives.
 * Types only — the composition root is ./app.
 */
import type { PairingStore } from "@cg/core"
import type { Logger } from "@cg/observability"
import type { CatalogDeps } from "./catalog"
import type { GatewayConfig } from "./config"
import type { RateLimiter } from "./http/rate-limit"
import type { PipelineDeps } from "./pipeline/execute"
import type { Relay } from "./relay/relay"

export type GatewayDeps = PipelineDeps &
  CatalogDeps & {
    config: GatewayConfig
    pairing: PairingStore
    /** Guards POST /v1/pair/start — the route that mints a code and a row. */
    pairingLimiter: RateLimiter
    /**
     * Guards POST /v1/pair/claim. Separate from `pairingLimiter` because the
     * legitimate agent POLLS this route for the whole life of the code, so its
     * budget has to cover one pairing session, not one request.
     */
    claimLimiter: RateLimiter
    /**
     * Guards EVERY other route (docs/03 "Apply rate limits"). Authenticating a
     * bearer token costs a PBKDF2 round whether or not the token is real, so an
     * unmetered edge lets an anonymous caller spend the gateway's CPU and its
     * control-plane quota at will.
     */
    edgeLimiter: RateLimiter
    relay: Relay
    logger: Logger
  }
