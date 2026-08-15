/**
 * Fixed-window rate limiting for the UNAUTHENTICATED pairing routes (docs/03
 * "Apply rate limits", docs/14 "pairing code brute force").
 *
 * ponytail: in-memory and per-process, so a second gateway instance doubles the
 * effective limit. Upgrade path — the same `check()` surface backed by a Convex
 * row or Redis INCR with the same window.
 */
export type RateLimiterOptions = {
  limit: number
  windowMs: number
  now?: () => number
  /** Hard cap on tracked keys, so a spray of unique IPs cannot exhaust memory. */
  maxKeys?: number
}

export type RateLimiter = {
  /** True when the call is allowed. Consumes one unit. */
  check(key: string): boolean
  reset(): void
  size(): number
}

const DEFAULT_MAX_KEYS = 10_000

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS
  const windows = new Map<string, { resetAt: number; count: number }>()

  function sweep(current: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt <= current) windows.delete(key)
    }
  }

  return {
    check(key: string): boolean {
      const current = now()
      const window = windows.get(key)

      if (!window || window.resetAt <= current) {
        if (windows.size >= maxKeys) sweep(current)
        // Still full after a sweep: every tracked window is live, so refuse
        // rather than grow. Fail closed.
        if (windows.size >= maxKeys) return false
        windows.set(key, { resetAt: current + options.windowMs, count: 1 })
        return true
      }

      if (window.count >= options.limit) return false
      window.count += 1
      return true
    },
    reset: () => windows.clear(),
    size: () => windows.size,
  }
}
