import { describe, expect, test } from "bun:test"
import { startTimer } from "./timer"

describe("startTimer", () => {
  test("reports non-negative, monotonically growing elapsed milliseconds", async () => {
    const elapsed = startTimer()
    const first = elapsed()
    expect(first).toBeGreaterThanOrEqual(0)

    await Bun.sleep(5)
    const second = elapsed()
    expect(second).toBeGreaterThanOrEqual(first)
    expect(second).toBeGreaterThanOrEqual(4)
  })
})
