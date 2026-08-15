import { describe, expect, test } from "bun:test"
import { verifyDeviceCredential } from "@cg/auth"
import type { ControlPlaneClient } from "./client"
import { createPairingStore, PAIRING_CODE_LENGTH, PAIRING_TTL_MS } from "./pairing"

type Call = { args: Record<string, unknown> }

function client(response: unknown, calls: Call[] = []): ControlPlaneClient {
  return {
    query: async () => response,
    mutation: async (_ref, args) => {
      calls.push({ args: args as Record<string, unknown> })
      return response
    },
  }
}

const DEVICE_ROW = {
  deviceId: "dev_1",
  userId: "usr_1",
  displayName: "Studio PC",
  platform: "linux",
  status: "offline",
  credentialVersion: 1,
  capabilities: [],
}

describe("createChallenge", () => {
  test("the gateway mints the id, the code and the expiry", async () => {
    const calls: Call[] = []
    const store = createPairingStore(
      client(
        {
          id: "pair_x",
          code: "ABCD2345",
          deviceName: "Studio PC",
          platform: "linux",
          status: "pending",
          expiresAt: 1,
        },
        calls,
      ),
    )
    const before = Date.now()
    await store.createChallenge({ deviceName: "Studio PC", platform: "linux", ttlMs: PAIRING_TTL_MS })

    const args = calls[0]?.args ?? {}
    expect(String(args.id)).toMatch(/^pair_/)
    expect(String(args.code)).toHaveLength(PAIRING_CODE_LENGTH)
    expect(Number(args.expiresAt)).toBeGreaterThanOrEqual(before + PAIRING_TTL_MS)
  })

  test("a malformed control-plane answer is an UPSTREAM_ERROR, not a fake challenge", async () => {
    const store = createPairingStore(client({ id: "pair_x" }))
    await expect(
      store.createChallenge({ deviceName: "PC", platform: "linux", ttlMs: 1000 }),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" })
  })
})

describe("claim", () => {
  test("sends only a HASH and returns the plaintext credential once", async () => {
    const calls: Call[] = []
    const store = createPairingStore(client({ device: DEVICE_ROW }, calls))
    const registration = await store.claim("pair_x")

    expect(registration?.credential).toMatch(/^cgd_dev_/)
    const args = calls[0]?.args ?? {}
    expect(String(args.credentialHash)).toStartWith("pbkdf2$sha256$")
    // The plaintext must never travel to the control plane.
    expect(JSON.stringify(args)).not.toContain(registration?.credential ?? "impossible")
  })

  test("the hash it stored verifies the credential it returned", async () => {
    const calls: Call[] = []
    const store = createPairingStore(client({ device: DEVICE_ROW }, calls))
    const registration = await store.claim("pair_x")
    const args = calls[0]?.args ?? {}

    const verified = await verifyDeviceCredential(registration?.credential ?? "", {
      deviceId: String(args.deviceId),
      credentialHash: String(args.credentialHash),
      status: "offline",
    })
    expect(verified).toBe(true)
  })

  test("a rejected claim yields null, not a credential", async () => {
    const store = createPairingStore(client(null))
    expect(await store.claim("pair_x")).toBeNull()
  })

  test("a claim answer without a usable device row yields null", async () => {
    const store = createPairingStore(client({ device: { deviceId: "dev_1" } }))
    expect(await store.claim("pair_x")).toBeNull()
  })
})

describe("approve", () => {
  test("is refused: only an authenticated human may approve", async () => {
    const store = createPairingStore(client(null))
    await expect(store.approve("ABCD2345", "usr_1")).rejects.toMatchObject({
      code: "NOT_AUTHORIZED",
    })
  })
})
