import { describe, expect, test } from "bun:test"
import { createRateLimiter } from "./rate-limit"

describe("createRateLimiter", () => {
  test("allows up to the limit, then refuses", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1_000, now: () => 0 })
    expect(limiter.check("ip")).toBe(true)
    expect(limiter.check("ip")).toBe(true)
    expect(limiter.check("ip")).toBe(true)
    expect(limiter.check("ip")).toBe(false)
  })

  test("keys are independent", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => 0 })
    expect(limiter.check("a")).toBe(true)
    expect(limiter.check("a")).toBe(false)
    expect(limiter.check("b")).toBe(true)
  })

  test("the window reopens after it elapses", () => {
    let clock = 0
    const limiter = createRateLimiter({ limit: 1, windowMs: 100, now: () => clock })
    expect(limiter.check("ip")).toBe(true)
    expect(limiter.check("ip")).toBe(false)
    clock = 101
    expect(limiter.check("ip")).toBe(true)
  })

  test("expired windows are swept so unique keys cannot grow forever", () => {
    let clock = 0
    const limiter = createRateLimiter({ limit: 1, windowMs: 10, maxKeys: 2, now: () => clock })
    limiter.check("a")
    limiter.check("b")
    expect(limiter.size()).toBe(2)
    clock = 50
    expect(limiter.check("c")).toBe(true)
    expect(limiter.size()).toBe(1)
  })

  test("fails CLOSED when every tracked window is still live", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000, maxKeys: 2, now: () => 0 })
    expect(limiter.check("a")).toBe(true)
    expect(limiter.check("b")).toBe(true)
    expect(limiter.check("c")).toBe(false)
  })
})
