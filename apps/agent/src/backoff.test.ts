import { describe, expect, test } from "bun:test"
import { RECONNECT_BASE_MS, RECONNECT_MAX_MS } from "@cg/protocol"
import { JITTER_RATIO, backoffDelay } from "./backoff"

const ATTEMPTS = Array.from({ length: 25 }, (_, index) => index + 1)

describe("backoffDelay", () => {
  test("stays inside [base, max] for every attempt and every jitter draw", () => {
    for (const random of [() => 0, () => 0.5, () => 0.999999, Math.random]) {
      for (const attempt of ATTEMPTS) {
        const delay = backoffDelay(attempt, { random })
        expect(delay).toBeGreaterThanOrEqual(RECONNECT_BASE_MS)
        expect(delay).toBeLessThanOrEqual(RECONNECT_MAX_MS)
      }
    }
  })

  test("is monotonic while it climbs, then saturates at the cap", () => {
    const random = () => 0.5 // no jitter: the pure curve
    let previous = 0
    for (const attempt of ATTEMPTS) {
      const delay = backoffDelay(attempt, { random })
      expect(delay).toBeGreaterThanOrEqual(previous)
      previous = delay
    }
    expect(previous).toBe(RECONNECT_MAX_MS)
  })

  test("jitter actually moves the delay, within +/- the declared ratio", () => {
    const attempt = 4
    const target = RECONNECT_BASE_MS * 2 ** (attempt - 1)
    const low = backoffDelay(attempt, { random: () => 0 })
    const mid = backoffDelay(attempt, { random: () => 0.5 })
    const high = backoffDelay(attempt, { random: () => 0.999999 })

    expect(low).toBeLessThan(mid)
    expect(high).toBeGreaterThan(mid)
    expect(mid).toBe(target)
    expect(low).toBeGreaterThanOrEqual(Math.round(target * (1 - JITTER_RATIO)))
    expect(high).toBeLessThanOrEqual(Math.round(target * (1 + JITTER_RATIO)))
  })

  test("never returns a shorter delay than the previous attempt, whatever the draws", () => {
    const draws = [0, 0.99, 0.1, 0.8, 0.2, 0.95, 0.05]
    let index = 0
    const random = (): number => {
      const value = draws[index % draws.length] ?? 0
      index += 1
      return value
    }
    let previous = 0
    // Only while climbing: once clamped at the cap, jitter may dip below the cap.
    for (const attempt of [1, 2, 3, 4]) {
      const delay = backoffDelay(attempt, { random })
      expect(delay).toBeGreaterThanOrEqual(previous)
      previous = delay
    }
  })

  test("degenerate attempts and options fall back to the protocol constants", () => {
    expect(backoffDelay(0, { random: () => 0.5 })).toBe(RECONNECT_BASE_MS)
    expect(backoffDelay(-5, { random: () => 0.5 })).toBe(RECONNECT_BASE_MS)
    expect(backoffDelay(1, { baseMs: Number.NaN, maxMs: -1, random: () => 0.5 })).toBe(RECONNECT_BASE_MS)
    expect(backoffDelay(1e9, { random: () => 0.5 })).toBe(RECONNECT_MAX_MS)
  })

  test("a custom band is honoured (pairing polls reuse this curve)", () => {
    for (const attempt of ATTEMPTS) {
      const delay = backoffDelay(attempt, { baseMs: 2000, maxMs: 10_000 })
      expect(delay).toBeGreaterThanOrEqual(2000)
      expect(delay).toBeLessThanOrEqual(10_000)
    }
  })
})
