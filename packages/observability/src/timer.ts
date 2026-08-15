/** Latency measurement (docs/10). Monotonic — immune to wall-clock jumps. */

/** Start measuring; call the returned function for elapsed milliseconds. */
export function startTimer(): () => number {
  const startedAt = performance.now()
  return () => performance.now() - startedAt
}
