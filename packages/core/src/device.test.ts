import { describe, expect, test } from "bun:test"
import { PRESENCE_REFRESH_MS, PRESENCE_TTL_MS, effectiveDeviceStatus } from "./device"

const NOW = 1_700_000_000_000

describe("effectiveDeviceStatus", () => {
  test("a fresh online claim is online", () => {
    expect(effectiveDeviceStatus("online", NOW - 1_000, NOW)).toBe("online")
  })

  test("an online claim exactly at the TTL is still online", () => {
    expect(effectiveDeviceStatus("online", NOW - PRESENCE_TTL_MS, NOW)).toBe("online")
  })

  test("an online claim past the TTL decays to offline", () => {
    expect(effectiveDeviceStatus("online", NOW - PRESENCE_TTL_MS - 1, NOW)).toBe("offline")
  })

  test("the gateway dying leaves a stale online row that reads offline", () => {
    // The disconnect handler never ran, so the row still says "online" with the
    // timestamp of its last refresh. This is the bug the TTL exists to close.
    const lastRefresh = NOW - 10 * 60_000
    expect(effectiveDeviceStatus("online", lastRefresh, NOW)).toBe("offline")
  })

  test("online without a lastSeenAt is offline, not online", () => {
    expect(effectiveDeviceStatus("online", undefined, NOW)).toBe("offline")
  })

  test("revoked is terminal and never decays into offline", () => {
    expect(effectiveDeviceStatus("revoked", undefined, NOW)).toBe("revoked")
    expect(effectiveDeviceStatus("revoked", NOW - PRESENCE_TTL_MS - 1, NOW)).toBe("revoked")
  })

  test("offline stays offline however fresh the timestamp is", () => {
    expect(effectiveDeviceStatus("offline", NOW, NOW)).toBe("offline")
  })

  test("a device that misses two refreshes still reads online", () => {
    // The margin that keeps a healthy device from flapping: the relay re-stamps
    // every PRESENCE_REFRESH_MS, and two missed writes must not cross the TTL.
    expect(PRESENCE_REFRESH_MS * 2).toBeLessThan(PRESENCE_TTL_MS)
    expect(effectiveDeviceStatus("online", NOW - PRESENCE_REFRESH_MS * 2, NOW)).toBe("online")
  })
})
