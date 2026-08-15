/**
 * PairingStore backed by Convex (docs/04-device-pairing.md).
 *
 * The GATEWAY owns the crypto: it mints the device id and credential, hashes
 * the secret, and sends only the hash to Convex. The plaintext credential is
 * returned to the agent exactly once and is never stored anywhere.
 */
import { GatewayError, newId } from "@cg/core"
import type { DevicePlatform, DeviceRegistration, PairingChallenge, PairingStore } from "@cg/core"
import { pairingCode } from "@cg/core"
import { issueDeviceCredential } from "@cg/auth"
import type { ControlPlaneClient } from "./client"
import { toDevice, toPairingChallenge } from "./guards"
import { REFS } from "./refs"

export const PAIRING_CODE_LENGTH = 8
export const PAIRING_TTL_MS = 5 * 60_000

export function createPairingStore(client: ControlPlaneClient): PairingStore {
  return {
    async createChallenge(input: {
      deviceName: string
      platform: DevicePlatform
      ttlMs: number
    }): Promise<PairingChallenge> {
      const created = await client.mutation(REFS.pairingCreateChallenge, {
        id: newId("pairing"),
        code: pairingCode(PAIRING_CODE_LENGTH),
        deviceName: input.deviceName,
        platform: input.platform,
        expiresAt: Date.now() + input.ttlMs,
      })
      const challenge = toPairingChallenge(created)
      if (!challenge) throw new GatewayError("UPSTREAM_ERROR", "Pairing could not be started.")
      return challenge
    },

    async getByCode(code: string): Promise<PairingChallenge | null> {
      return toPairingChallenge(await client.query(REFS.pairingGetByCode, { code }))
    },

    async approve(): Promise<void> {
      // Approval requires a signed-in human: apps/web calls
      // features/pairing/mutations:approve. The gateway has no user session and
      // must not be able to approve a device with its service token.
      throw new GatewayError("NOT_AUTHORIZED", "Pairing is approved from the dashboard.")
    },

    /**
     * One-time. `service/pairing:claim` is atomic and enforces
     * approved + unclaimed + unexpired; a null return means one of those failed
     * and the caller learns nothing more specific.
     */
    async claim(challengeId: string): Promise<DeviceRegistration | null> {
      const deviceId = newId("device")
      const { credential, credentialHash } = await issueDeviceCredential(deviceId)
      const claimed = await client.mutation(REFS.pairingClaim, {
        challengeId,
        deviceId,
        credentialHash,
      })
      const device = toDevice((claimed as { device?: unknown } | null)?.device)
      if (!device) return null
      return { device, credential }
    },
  }
}
