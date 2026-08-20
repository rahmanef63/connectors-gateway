/**
 * Convex-backed rate limiter adapter for the future multi-instance gateway.
 *
 * Not wired into createApp while the relay remains singleton. Keeping this
 * adapter production-ready now makes the later topology switch explicit rather
 * than changing rate semantics at the same time as socket routing.
 */
import { createHash } from "node:crypto"
import type { ControlPlaneClient } from "../store/client"
import { REFS } from "../store/refs"

export type DistributedRateLimiter = {
  check(key: string): Promise<boolean>
}

export function createDistributedRateLimiter(
  client: ControlPlaneClient,
  options: { bucket: string; limit: number; windowMs: number },
): DistributedRateLimiter {
  return {
    async check(key: string): Promise<boolean> {
      try {
        const result = await client.mutation(REFS.rateLimitsConsume, {
          bucket: options.bucket,
          keyDigest: digestKey(key),
          limit: options.limit,
          windowMs: options.windowMs,
        })
        return isResult(result) ? result.allowed : false
      } catch {
        // Rate limiting is a security boundary. A shared-store outage must not
        // turn into unlimited traffic if this adapter is enabled later.
        return false
      }
    },
  }
}

export function digestKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

function isResult(value: unknown): value is { allowed: boolean; resetAt: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.allowed === "boolean" && typeof row.resetAt === "number" && Number.isFinite(row.resetAt)
}
