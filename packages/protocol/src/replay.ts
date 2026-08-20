/**
 * In-memory replay guard: useful for isolated tests and ephemeral callers.
 *
 * The production local agent uses its durable, lock-protected implementation in
 * `apps/agent/src/replay-store.ts`; restarting the agent must not forget a still
 * valid signed job id.
 */
import { GatewayError, type ReplayGuard } from "@cg/core"

export const MAX_REPLAY_ENTRIES = 10_000
export const MAX_REPLAY_JOB_ID_LENGTH = 512

export type MemoryReplayGuardOptions = {
  /** Hard bound on retained ids; the oldest are evicted first. */
  maxEntries?: number
  /** Injectable clock for tests. */
  now?: () => number
}

export function createMemoryReplayGuard(options: MemoryReplayGuardOptions = {}): ReplayGuard {
  const maxEntries = options.maxEntries ?? MAX_REPLAY_ENTRIES
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new GatewayError("INVALID_INPUT", "maxEntries must be a positive integer.")
  }
  const clock = options.now ?? Date.now
  /** jobId -> expiry epoch ms. Map iteration is insertion-ordered: oldest first. */
  const seen = new Map<string, number>()

  return {
    async remember(jobId: string, ttlMs: number): Promise<boolean> {
      if (
        typeof jobId !== "string" ||
        jobId.length === 0 ||
        jobId.length > MAX_REPLAY_JOB_ID_LENGTH ||
        hasControlCharacter(jobId)
      ) {
        throw new GatewayError("INVALID_INPUT", "A bounded job id is required.")
      }
      if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
        throw new GatewayError("INVALID_INPUT", "A positive replay ttl is required.")
      }

      const now = clock()
      const expiresAt = seen.get(jobId)
      if (expiresAt !== undefined) {
        if (expiresAt > now) return false
        // Past its window: the id is forgettable, so treat it as fresh.
        seen.delete(jobId)
      }

      if (seen.size >= maxEntries) sweep(seen, now)
      seen.set(jobId, now + ttlMs)
      // Entries expire at different times, so a sweep can free nothing; evict oldest.
      while (seen.size > maxEntries) {
        const oldest = seen.keys().next()
        if (oldest.done === true) break
        seen.delete(oldest.value)
      }
      return true
    },
  }
}

/** Lazy: only runs when the guard is at capacity, so it stays O(1) amortized. */
function sweep(seen: Map<string, number>, now: number): void {
  for (const [jobId, expiresAt] of seen) {
    if (expiresAt <= now) seen.delete(jobId)
  }
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}
