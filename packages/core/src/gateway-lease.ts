/**
 * Current runtime topology contract.
 *
 * Relay sockets, request-rate buckets and the agent replay guard are process
 * local. Until those three stores become shared, production correctness requires
 * one active gateway process. Convex owns this short lease so the constraint is
 * enforced rather than left as a deployment convention.
 */
export const GATEWAY_LEASE_NAME = "primary"
export const GATEWAY_LEASE_TTL_MS = 30_000
export const GATEWAY_LEASE_RENEW_MS = 10_000
