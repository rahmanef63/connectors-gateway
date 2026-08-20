import { describe, expect, test } from "bun:test"
import { blockedRange, isLoopback } from "./ip-address"

describe("blockedRange", () => {
  const blocked = [
    "0.1.2.3", "10.0.0.1", "100.64.0.1", "100.127.255.254", "127.0.0.1",
    "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.8", "192.0.2.1",
    "192.88.99.1", "192.168.1.1", "198.18.0.1", "198.19.255.254", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
    "[::]", "[::1]", "[100::1]", "[2001:db8::1]", "[fc00::1]", "[fd00::1]",
    "[fe80::1]", "[ff02::1]", "[::ffff:10.0.0.1]", "[::ffff:169.254.169.254]",
  ]
  for (const host of blocked) {
    test(`blocks ${host}`, () => expect(blockedRange(host)).not.toBeNull())
  }

  const publicHosts = ["8.8.8.8", "1.1.1.1", "11.0.0.1", "100.128.0.1", "172.32.0.1", "192.167.0.1", "2001:4860:4860::8888", "example.com"]
  for (const host of publicHosts) {
    test(`does not classify ${host} as blocked`, () => expect(blockedRange(host)).toBeNull())
  }
})

describe("isLoopback", () => {
  for (const host of ["localhost", "api.localhost", "LOCALHOST.", "127.9.8.7", "[::1]", "[::ffff:127.0.0.1]"]) {
    test(`recognizes ${host}`, () => expect(isLoopback(host)).toBe(true))
  }
  test("does not trust a lookalike suffix", () => expect(isLoopback("localhost.evil.test")).toBe(false))
})
