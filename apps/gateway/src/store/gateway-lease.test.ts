import { describe, expect, test } from "bun:test"
import { silentLogger } from "../__tests__/fixtures"
import type { ControlPlaneClient } from "./client"
import { createGatewayLease } from "./gateway-lease"
import { REFS } from "./refs"

const NOW = 1_700_000_000_000
const HOLDER = "gw_testholder1234567890"

type MutationHandler = (ref: unknown, args: Record<string, unknown>) => Promise<unknown>

function client(handler: MutationHandler): ControlPlaneClient {
  return {
    query: async () => null,
    mutation: handler,
  } as ControlPlaneClient
}

describe("createGatewayLease", () => {
  test("acquires, renews and releases the same opaque holder", async () => {
    let clock = NOW
    const calls: Array<{ ref: unknown; args: Record<string, unknown> }> = []
    const lease = createGatewayLease(
      client(async (ref, args) => {
        calls.push({ ref, args })
        if (ref === REFS.gatewayLeaseAcquire) return { acquired: true, expiresAt: NOW + 30_000 }
        if (ref === REFS.gatewayLeaseRenew) return { renewed: true, expiresAt: NOW + 40_000 }
        if (ref === REFS.gatewayLeaseRelease) return { released: true }
        throw new Error("unexpected mutation")
      }),
      { logger: silentLogger, holderId: HOLDER, now: () => clock },
    )

    await lease.acquire()
    expect(lease.isValid()).toBe(true)
    expect(await lease.renewNow()).toBe(true)
    clock = NOW + 35_000
    expect(lease.isValid()).toBe(true)
    await lease.stop()
    expect(lease.isValid()).toBe(false)
    expect(calls.map((call) => call.ref)).toEqual([
      REFS.gatewayLeaseAcquire,
      REFS.gatewayLeaseRenew,
      REFS.gatewayLeaseRelease,
    ])
    for (const call of calls) expect(call.args.holderId).toBe(HOLDER)
  })

  test("refuses startup while another live process owns the lease", async () => {
    const lease = createGatewayLease(
      client(async () => ({ acquired: false, expiresAt: NOW + 30_000 })),
      { logger: silentLogger, holderId: HOLDER, now: () => NOW },
    )

    await expect(lease.acquire()).rejects.toMatchObject({ code: "UPSTREAM_ERROR" })
    expect(lease.isValid()).toBe(false)
  })

  test("an explicit renewal refusal resolves the loss signal immediately", async () => {
    let calls = 0
    const lease = createGatewayLease(
      client(async (ref) => {
        calls += 1
        if (ref === REFS.gatewayLeaseAcquire) return { acquired: true, expiresAt: NOW + 30_000 }
        return { renewed: false, expiresAt: NOW + 30_000 }
      }),
      { logger: silentLogger, holderId: HOLDER, now: () => NOW },
    )

    await lease.acquire()
    expect(await lease.renewNow()).toBe(false)
    await expect(lease.lost).resolves.toBe("not_renewed")
    expect(lease.isValid()).toBe(false)
    expect(calls).toBe(2)
    await lease.stop()
  })

  test("a transient control-plane error is tolerated only until confirmed expiry", async () => {
    let clock = NOW
    const lease = createGatewayLease(
      client(async (ref) => {
        if (ref === REFS.gatewayLeaseAcquire) return { acquired: true, expiresAt: NOW + 30_000 }
        throw new Error("control plane unavailable")
      }),
      { logger: silentLogger, holderId: HOLDER, now: () => clock },
    )

    await lease.acquire()
    expect(await lease.renewNow()).toBe(false)
    expect(lease.isValid()).toBe(true)

    clock = NOW + 30_000
    expect(await lease.renewNow()).toBe(false)
    await expect(lease.lost).resolves.toBe("expired")
    expect(lease.isValid()).toBe(false)
    await lease.stop()
  })

  test("invalid wire data never extends the local validity window", async () => {
    let clock = NOW
    const lease = createGatewayLease(
      client(async (ref) =>
        ref === REFS.gatewayLeaseAcquire
          ? { acquired: true, expiresAt: NOW + 30_000 }
          : { renewed: "yes", expiresAt: NOW + 300_000 },
      ),
      { logger: silentLogger, holderId: HOLDER, now: () => clock },
    )

    await lease.acquire()
    expect(await lease.renewNow()).toBe(false)
    clock = NOW + 30_000
    expect(lease.isValid()).toBe(false)
    await lease.stop()
  })

  test("start requires a live acquisition and is idempotent", async () => {
    const lease = createGatewayLease(
      client(async (ref) => {
        if (ref === REFS.gatewayLeaseAcquire) return { acquired: true, expiresAt: NOW + 30_000 }
        if (ref === REFS.gatewayLeaseRelease) return { released: true }
        return { renewed: true, expiresAt: NOW + 30_000 }
      }),
      { logger: silentLogger, holderId: HOLDER, now: () => NOW, renewEveryMs: 60_000 },
    )

    expect(() => lease.start()).toThrow()
    await lease.acquire()
    expect(() => lease.start()).not.toThrow()
    expect(() => lease.start()).not.toThrow()
    await lease.stop()
  })
})
