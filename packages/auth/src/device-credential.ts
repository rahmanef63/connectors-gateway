/**
 * Per-device credentials (docs/04-device-pairing.md).
 * The plaintext credential exists exactly once, at claim time; the control plane
 * stores only the hash. It is never shown to an AI client (AGENTS.md invariant 4).
 */
import type { DeviceStatus } from "@cg/core"
import { dummyStoredHash, hashSecret, verifySecret } from "./hash"
import { TOKEN_PREFIXES, formatToken, newCredentialSecret, parseToken } from "./tokens"

export type IssuedDeviceCredential = {
  /** `cgd_<deviceId>_<secret>` — return to the agent once, then forget. */
  credential: string
  credentialHash: string
}

export type DeviceCredentialRecord = {
  deviceId: string
  credentialHash: string
  status: DeviceStatus
  /** Bumped on rotation; an older credential fails the hash check. */
  credentialVersion?: number
}

export async function issueDeviceCredential(deviceId: string): Promise<IssuedDeviceCredential> {
  const secret = newCredentialSecret()
  const credential = formatToken(TOKEN_PREFIXES.device, deviceId, secret)
  const credentialHash = await hashSecret(secret)
  return { credential, credentialHash }
}

/**
 * False for: malformed credential, wrong device, wrong secret, revoked device.
 * The KDF always runs before the status branch so a revoked device is not
 * distinguishable by timing from a wrong secret.
 */
export async function verifyDeviceCredential(
  credential: string,
  record: DeviceCredentialRecord,
): Promise<boolean> {
  const parsed = parseToken(TOKEN_PREFIXES.device, credential)
  if (!parsed) return false
  if (typeof record?.deviceId !== "string" || typeof record.credentialHash !== "string") {
    return false
  }
  const matchesDevice = parsed.id === record.deviceId
  const stored = matchesDevice ? record.credentialHash : await dummyStoredHash()
  const secretOk = await verifySecret(parsed.secret, stored)
  return matchesDevice && secretOk && record.status !== "revoked"
}
