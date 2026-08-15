import { beforeAll, describe, expect, test } from "bun:test"
import {
  type DeviceCredentialRecord,
  issueDeviceCredential,
  verifyDeviceCredential,
} from "./device-credential"
import { TOKEN_PREFIXES, formatToken, newCredentialSecret } from "./tokens"

const DEVICE_ID = "dev_a1b2c3"
let issued: Awaited<ReturnType<typeof issueDeviceCredential>>
let record: DeviceCredentialRecord

beforeAll(async () => {
  issued = await issueDeviceCredential(DEVICE_ID)
  record = { deviceId: DEVICE_ID, credentialHash: issued.credentialHash, status: "online" }
})

describe("issueDeviceCredential", () => {
  test("returns a cgd token carrying the device id and a separate hash", () => {
    expect(issued.credential.startsWith(`cgd_${DEVICE_ID}_`)).toBe(true)
    expect(issued.credentialHash.startsWith("pbkdf2$sha256$")).toBe(true)
    // The stored hash must not contain the plaintext credential.
    const secret = issued.credential.split("_").at(-1) ?? ""
    expect(issued.credentialHash.includes(secret)).toBe(false)
  })

  test("is unique per issue", async () => {
    const other = await issueDeviceCredential(DEVICE_ID)
    expect(other.credential).not.toBe(issued.credential)
  })
})

describe("verifyDeviceCredential", () => {
  test("accepts the issued credential for an active device", async () => {
    expect(await verifyDeviceCredential(issued.credential, record)).toBe(true)
    expect(await verifyDeviceCredential(issued.credential, { ...record, status: "offline" })).toBe(
      true,
    )
  })

  test("DENIED: revoked device", async () => {
    expect(await verifyDeviceCredential(issued.credential, { ...record, status: "revoked" })).toBe(
      false,
    )
  })

  test("DENIED: wrong secret for the right device", async () => {
    const forged = formatToken(TOKEN_PREFIXES.device, DEVICE_ID, newCredentialSecret())
    expect(await verifyDeviceCredential(forged, record)).toBe(false)
  })

  test("DENIED: right secret presented for another device id", async () => {
    expect(
      await verifyDeviceCredential(issued.credential, { ...record, deviceId: "dev_other" }),
    ).toBe(false)
  })

  test("DENIED: rotated credential (hash replaced) fails", async () => {
    const rotated = await issueDeviceCredential(DEVICE_ID)
    expect(
      await verifyDeviceCredential(issued.credential, {
        ...record,
        credentialHash: rotated.credentialHash,
        credentialVersion: 2,
      }),
    ).toBe(false)
    expect(
      await verifyDeviceCredential(rotated.credential, {
        ...record,
        credentialHash: rotated.credentialHash,
        credentialVersion: 2,
      }),
    ).toBe(true)
  })

  test("DENIED: malformed credentials and records", async () => {
    expect(await verifyDeviceCredential("", record)).toBe(false)
    expect(await verifyDeviceCredential("cgd_dev_a1b2c3_short", record)).toBe(false)
    expect(
      await verifyDeviceCredential(
        formatToken(TOKEN_PREFIXES.apiKey, DEVICE_ID, newCredentialSecret()),
        record,
      ),
    ).toBe(false)
    expect(
      await verifyDeviceCredential(issued.credential, {
        ...record,
        credentialHash: "garbage",
      }),
    ).toBe(false)
    expect(
      await verifyDeviceCredential(issued.credential, {} as unknown as DeviceCredentialRecord),
    ).toBe(false)
  })
})
