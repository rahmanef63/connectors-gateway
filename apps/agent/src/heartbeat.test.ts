import { describe, expect, test } from "bun:test"
import { createHeartbeat } from "./heartbeat"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

describe("createHeartbeat", () => {
  test("sends on every interval while the gateway keeps answering", async () => {
    let sent = 0
    let timedOut = false
    const beat = createHeartbeat({
      send: () => void (sent += 1),
      onTimeout: () => void (timedOut = true),
      intervalMs: 5,
      timeoutMs: 10_000,
    })
    beat.start()
    await sleep(30)
    beat.stop()
    expect(sent).toBeGreaterThan(0)
    expect(timedOut).toBe(false)
  })

  test("fires onTimeout once when no frame arrives, and stops sending", async () => {
    let sent = 0
    let timeouts = 0
    const beat = createHeartbeat({
      send: () => void (sent += 1),
      onTimeout: () => void (timeouts += 1),
      intervalMs: 2,
      timeoutMs: 1,
    })
    beat.start()
    await sleep(25)
    beat.stop()
    expect(timeouts).toBe(1)
    expect(sent).toBe(0)
  })

  test("an inbound frame keeps the connection alive", async () => {
    let timeouts = 0
    const beat = createHeartbeat({
      send: () => {},
      onTimeout: () => void (timeouts += 1),
      intervalMs: 3,
      timeoutMs: 20,
    })
    beat.start()
    for (let i = 0; i < 8; i += 1) {
      await sleep(5)
      beat.onFrame()
    }
    beat.stop()
    expect(timeouts).toBe(0)
  })

  test("stop() is idempotent and silences the timer", async () => {
    let sent = 0
    const beat = createHeartbeat({
      send: () => void (sent += 1),
      onTimeout: () => {},
      intervalMs: 2,
      timeoutMs: 10_000,
    })
    beat.start()
    beat.stop()
    beat.stop()
    const before = sent
    await sleep(15)
    expect(sent).toBe(before)
  })
})
