import { describe, expect, test } from "bun:test"
import {
  GATEWAY_LEASE_NAME,
  GATEWAY_LEASE_RENEW_MS,
  GATEWAY_LEASE_TTL_MS,
} from "./gateway-lease"

describe("gateway singleton lease constants", () => {
  test("renews several times before one lease can expire", () => {
    expect(GATEWAY_LEASE_NAME).toBe("primary")
    expect(GATEWAY_LEASE_RENEW_MS).toBeGreaterThan(0)
    expect(GATEWAY_LEASE_TTL_MS).toBeGreaterThanOrEqual(GATEWAY_LEASE_RENEW_MS * 3)
  })
})
