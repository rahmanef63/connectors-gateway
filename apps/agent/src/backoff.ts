/**
 * Reconnect backoff: exponential, capped, jittered.
 *
 * Jitter is bounded (±20% of the target) rather than full-random so the curve
 * stays monotonic — a herd of agents still spreads out, but a long outage never
 * produces a delay shorter than the base or longer than the cap.
 */
import { RECONNECT_BASE_MS, RECONNECT_MAX_MS } from "@cg/protocol"

export const JITTER_RATIO = 0.2

/** 2^40 * base already exceeds any sane cap; stops the exponent overflowing. */
const MAX_EXPONENT = 40

export type BackoffOptions = {
  baseMs?: number
  maxMs?: number
  /** Injectable for tests; must return [0, 1). */
  random?: () => number
}

/** `attempt` is 1-based: the delay before the first reconnect is attempt 1. */
export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const baseMs = positive(options.baseMs, RECONNECT_BASE_MS)
  const maxMs = Math.max(baseMs, positive(options.maxMs, RECONNECT_MAX_MS))
  const random = options.random ?? Math.random

  const steps = Math.min(MAX_EXPONENT, Math.max(0, Math.floor(attempt) - 1))
  const target = Math.min(maxMs, baseMs * 2 ** steps)
  const jitter = target * JITTER_RATIO * (random() * 2 - 1)
  return clamp(Math.round(target + jitter), baseMs, maxMs)
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}
