import { describe, expect, test } from "bun:test"
import {
  toApiKeyRecord,
  toConnections,
  toDevice,
  toDeviceRecord,
  toDevices,
  toPairingChallenge,
  toPolicyRules,
  toStoredCredential,
} from "./guards"

const DEVICE_ROW = {
  deviceId: "dev_1",
  userId: "usr_1",
  displayName: "Workstation",
  platform: "linux",
  status: "online",
  credentialVersion: 2,
  capabilities: ["blender:scene.render", 7],
  credentialHash: "pbkdf2$sha256$210000$salt$hash",
}

describe("toDevice", () => {
  test("maps a well-formed row and drops non-string capabilities", () => {
    const device = toDevice(DEVICE_ROW)
    expect(device).toMatchObject({ id: "dev_1", status: "online", credentialVersion: 2 })
    expect(device?.capabilities).toEqual(["blender:scene.render"])
  })

  test("an unknown platform or status makes the whole row absent", () => {
    expect(toDevice({ ...DEVICE_ROW, platform: "haiku" })).toBeNull()
    expect(toDevice({ ...DEVICE_ROW, status: "pwned" })).toBeNull()
  })

  test("a missing user id makes the row absent", () => {
    expect(toDevice({ ...DEVICE_ROW, userId: "" })).toBeNull()
  })

  test("non-objects are absent", () => {
    for (const value of [null, undefined, "dev_1", 7, [DEVICE_ROW]]) {
      expect(toDevice(value)).toBeNull()
    }
  })

  test("the credential hash is not carried by toDevice", () => {
    expect(JSON.stringify(toDevice(DEVICE_ROW))).not.toContain("pbkdf2")
  })
})

describe("toDeviceRecord", () => {
  test("requires the credential hash", () => {
    expect(toDeviceRecord(DEVICE_ROW)?.credentialHash).toBe("pbkdf2$sha256$210000$salt$hash")
    const { credentialHash: _drop, ...withoutHash } = DEVICE_ROW
    expect(toDeviceRecord(withoutHash)).toBeNull()
  })
})

describe("toDevices", () => {
  test("drops malformed rows instead of failing the whole list", () => {
    expect(toDevices([DEVICE_ROW, { junk: true }, null])).toHaveLength(1)
    expect(toDevices("not an array")).toEqual([])
  })
})

describe("toPairingChallenge", () => {
  const row = {
    id: "pair_1",
    code: "ABCD2345",
    deviceName: "Studio PC",
    platform: "linux",
    status: "approved",
    expiresAt: 123,
  }

  test("maps a valid challenge", () => {
    expect(toPairingChallenge(row)).toMatchObject({ id: "pair_1", status: "approved" })
  })

  test("an unknown status is absent", () => {
    expect(toPairingChallenge({ ...row, status: "definitely-approved" })).toBeNull()
  })

  test("a non-numeric expiry is absent", () => {
    expect(toPairingChallenge({ ...row, expiresAt: "soon" })).toBeNull()
  })
})

describe("toPolicyRules", () => {
  test("keeps valid rules and drops the rest", () => {
    const rules = toPolicyRules([
      { connectorId: "blender", actionId: "*", decision: "DENY" },
      { connectorId: "blender", actionId: "x", decision: "allow" },
      { connectorId: "blender", decision: "ALLOW" },
      "nope",
    ])
    expect(rules).toEqual([{ connectorId: "blender", actionId: "*", decision: "DENY" }])
  })
})

describe("toConnections", () => {
  test("drops a row with an unknown owner type", () => {
    const rows = [
      { id: "c1", connectorId: "careerpack", ownerType: "user", ownerId: "u", status: "active" },
      { id: "c2", connectorId: "careerpack", ownerType: "root", ownerId: "u", status: "active" },
    ]
    expect(toConnections(rows)).toHaveLength(1)
  })
})

describe("toStoredCredential", () => {
  test("requires the ciphertext field", () => {
    expect(
      toStoredCredential({ connectionId: "c1", baseUrl: "https://x", tokenCipher: "v1.a.b" }),
    ).toMatchObject({ tokenCipher: "v1.a.b" })
    expect(toStoredCredential({ connectionId: "c1", baseUrl: "https://x", token: "plain" })).toBeNull()
  })
})

describe("toApiKeyRecord", () => {
  const row = {
    keyId: "keytest1",
    userId: "usr_1",
    scopes: ["*"],
    status: "active",
    secretHash: "pbkdf2$sha256$210000$salt$hash",
  }

  test("maps a valid row", () => {
    expect(toApiKeyRecord(row)).toMatchObject({ id: "keytest1", status: "active" })
  })

  test("an unknown status makes the key unusable rather than partially trusted", () => {
    expect(toApiKeyRecord({ ...row, status: "super-active" })).toBeNull()
  })

  test("a missing secret hash makes the key absent", () => {
    const { secretHash: _drop, ...withoutHash } = row
    expect(toApiKeyRecord(withoutHash)).toBeNull()
  })
})
