import { describe, expect, test } from "bun:test"
import { silentLogger } from "../__tests__/fixtures"
import { createControlPlaneClient } from "./client"
import { REFS } from "./refs"

type Call = { ref: unknown; args: Record<string, unknown> }

function transport(calls: Call[], fail = false) {
  const record = async (ref: unknown, args: Record<string, unknown>) => {
    calls.push({ ref, args })
    if (fail) throw new Error("Convex error: serviceToken=super-secret-token rejected")
    return { ok: true }
  }
  return { query: record, mutation: record } as never
}

function client(calls: Call[], fail = false) {
  return createControlPlaneClient({
    url: "http://127.0.0.1:3210",
    serviceToken: "super-secret-token",
    logger: silentLogger,
    transport: transport(calls, fail),
  })
}

describe("createControlPlaneClient", () => {
  test("injects the service token into every call", async () => {
    const calls: Call[] = []
    await client(calls).query(REFS.devicesGetRecord, { deviceId: "dev_1" })
    await client(calls).mutation(REFS.devicesSetPresence, { deviceId: "dev_1", online: true })

    expect(calls).toHaveLength(2)
    expect(calls[0]?.args).toEqual({ deviceId: "dev_1", serviceToken: "super-secret-token" })
    expect(calls[1]?.args.serviceToken).toBe("super-secret-token")
  })

  test("a control-plane failure becomes an opaque UPSTREAM_ERROR", async () => {
    const calls: Call[] = []
    const call = client(calls, true).query(REFS.apiKeysGetRecord, { keyId: "k" })
    await expect(call).rejects.toMatchObject({ code: "UPSTREAM_ERROR" })
  })

  test("the underlying error message, which can quote the service token, is not propagated", async () => {
    const calls: Call[] = []
    try {
      await client(calls, true).query(REFS.apiKeysGetRecord, { keyId: "k" })
      throw new Error("expected a throw")
    } catch (error) {
      expect((error as Error).message).not.toContain("super-secret-token")
    }
  })
})

describe("REFS", () => {
  test("pins the cross-process contract strings", () => {
    // These strings are the contract with apps/web/convex. Changing one here
    // without changing the Convex module breaks the gateway at runtime only.
    expect(Object.keys(REFS)).toEqual([
      "devicesGetRecord",
      "devicesListForUser",
      "devicesSetPresence",
      "pairingCreateChallenge",
      "pairingGetByCode",
      "pairingClaim",
      "approvalsClaim",
      "approvalsRequest",
      "policyListRules",
      "connectionsListForUser",
      "connectionsResolveCredential",
      "auditAppend",
      "apiKeysGetRecord",
      "oauthRegisterClient",
      "oauthRedeemCode",
    ])
  })
})
