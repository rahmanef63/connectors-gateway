import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { createMemoryReplayGuard } from "./replay"

function fakeClock(start = 1_000): { now: () => number; advance: (ms: number) => void } {
  let current = start
  return { now: () => current, advance: (ms) => (current += ms) }
}

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (error) {
    return error instanceof GatewayError ? error.code : "NOT_A_GATEWAY_ERROR"
  }
  return "NO_THROW"
}

describe("memory replay guard", () => {
  test("accepts a fresh id once and rejects the replay", async () => {
    const guard = createMemoryReplayGuard({ maxEntries: 10 })
    expect(await guard.remember("job_1", 1_000)).toBe(true)
    expect(await guard.remember("job_1", 1_000)).toBe(false)
    expect(await guard.remember("job_1", 1_000)).toBe(false)
    expect(await guard.remember("job_2", 1_000)).toBe(true)
  })

  test("forgets an id once its ttl has passed", async () => {
    const clock = fakeClock()
    const guard = createMemoryReplayGuard({ maxEntries: 10, now: clock.now })
    expect(await guard.remember("job_1", 1_000)).toBe(true)
    clock.advance(999)
    expect(await guard.remember("job_1", 1_000)).toBe(false)
    clock.advance(1)
    // Exactly at expiry the replay window is over.
    expect(await guard.remember("job_1", 1_000)).toBe(true)
  })

  test("evicts the oldest entries when over capacity", async () => {
    const guard = createMemoryReplayGuard({ maxEntries: 3 })
    for (const id of ["a", "b", "c", "d", "e"]) {
      expect(await guard.remember(id, 60_000)).toBe(true)
    }
    // a and b were evicted, so they are accepted again; the newest three are not.
    expect(await guard.remember("a", 60_000)).toBe(true)
    expect(await guard.remember("e", 60_000)).toBe(false)
    expect(await guard.remember("d", 60_000)).toBe(false)
  })

  test("stays bounded under sustained load", async () => {
    const guard = createMemoryReplayGuard({ maxEntries: 5 })
    for (let i = 0; i < 500; i += 1) {
      expect(await guard.remember(`job_${i}`, 60_000)).toBe(true)
    }
    expect(await guard.remember("job_499", 60_000)).toBe(false)
    expect(await guard.remember("job_0", 60_000)).toBe(true)
  })

  test("reclaims expired entries before evicting live ones", async () => {
    const clock = fakeClock()
    const guard = createMemoryReplayGuard({ maxEntries: 3, now: clock.now })
    await guard.remember("old_1", 1_000)
    await guard.remember("old_2", 1_000)
    clock.advance(2_000)
    await guard.remember("live_1", 60_000)
    await guard.remember("live_2", 60_000)
    await guard.remember("live_3", 60_000)
    expect(await guard.remember("live_1", 60_000)).toBe(false)
    expect(await guard.remember("live_2", 60_000)).toBe(false)
    expect(await guard.remember("live_3", 60_000)).toBe(false)
  })

  test("rejects unusable arguments", async () => {
    const guard = createMemoryReplayGuard({ maxEntries: 2 })
    expect(await codeOf(() => guard.remember("", 1_000))).toBe("INVALID_INPUT")
    expect(await codeOf(() => guard.remember(undefined as unknown as string, 1_000))).toBe("INVALID_INPUT")
    expect(await codeOf(() => guard.remember("job_1", 0))).toBe("INVALID_INPUT")
    expect(await codeOf(() => guard.remember("job_1", -1))).toBe("INVALID_INPUT")
    expect(await codeOf(() => guard.remember("job_1", Number.NaN))).toBe("INVALID_INPUT")
  })

  test("rejects an unusable capacity", () => {
    expect(() => createMemoryReplayGuard({ maxEntries: 0 })).toThrow(GatewayError)
    expect(() => createMemoryReplayGuard({ maxEntries: 1.5 })).toThrow(GatewayError)
  })

  test("defaults are usable with no options", async () => {
    const guard = createMemoryReplayGuard()
    expect(await guard.remember("job_1", 1_000)).toBe(true)
    expect(await guard.remember("job_1", 1_000)).toBe(false)
  })
})
