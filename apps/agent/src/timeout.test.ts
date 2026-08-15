import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { DEFAULT_JOB_TIMEOUT_MS, raceTimeout } from "./timeout"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

describe("raceTimeout", () => {
  test("returns the value when the work finishes first", async () => {
    expect(await raceTimeout(Promise.resolve(42), 1000, "too slow")).toBe(42)
  })

  test("throws TIMEOUT when the work never settles", async () => {
    try {
      await raceTimeout(new Promise(() => {}), 5, "too slow")
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("TIMEOUT")
      expect((cause as GatewayError).message).toBe("too slow")
    }
  })

  test("a late rejection after a timeout does not become an unhandled rejection", async () => {
    const late = new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error("late failure")), 10)
    })
    await expect(raceTimeout(late, 2, "too slow")).rejects.toThrow(GatewayError)
    // If the losing promise were unhandled, this tick would print a warning/crash.
    await sleep(25)
    expect(true).toBe(true)
  })

  test("the original rejection wins when it lands first", async () => {
    const failing = Promise.reject(new GatewayError("UPSTREAM_ERROR", "bridge said no"))
    await expect(raceTimeout(failing, 1000, "too slow")).rejects.toThrow("bridge said no")
  })

  test("the default job timeout is a sane bound", () => {
    expect(DEFAULT_JOB_TIMEOUT_MS).toBeGreaterThan(0)
    expect(DEFAULT_JOB_TIMEOUT_MS).toBeLessThanOrEqual(300_000)
  })
})
