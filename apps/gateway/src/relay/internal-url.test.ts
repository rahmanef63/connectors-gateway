import { describe, expect, test } from "bun:test"
import { detectInternalRelayUrl } from "./internal-url"

const entry = (address: string, internal = false) => ({ address, netmask: "255.255.255.0", family: "IPv4" as const, mac: "00:00:00:00:00:00", internal, cidr: `${address}/24` })

describe("detectInternalRelayUrl", () => {
  test("prefers a private 10/8 overlay address", () => {
    expect(detectInternalRelayUrl(8787, { production: true, interfaces: { eth0: [entry("172.18.0.4")], eth1: [entry("10.0.2.8")] } })).toBe("http://10.0.2.8:8787")
  })
  test("development falls back to loopback but production fails closed", () => {
    expect(detectInternalRelayUrl(8787, { production: false, interfaces: { lo: [entry("127.0.0.1", true)] } })).toBe("http://127.0.0.1:8787")
    expect(() => detectInternalRelayUrl(8787, { production: true, interfaces: { lo: [entry("127.0.0.1", true)] } })).toThrow()
  })
})
