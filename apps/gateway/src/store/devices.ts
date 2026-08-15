/**
 * DeviceStore backed by the Convex control plane.
 *
 * The credential hash never leaves this module: callers get a `Device` or an
 * auth verdict, never the stored material (AGENTS.md invariant 4).
 */
import { GatewayError } from "@cg/core"
import type { Device, DeviceStore } from "@cg/core"
import { verifyDeviceCredential } from "@cg/auth"
import type { ControlPlaneClient } from "./client"
import { toDevice, toDeviceRecord, toDevices } from "./guards"
import { REFS } from "./refs"

/** Distinguishes 4001 (bad credential) from 4003 (revoked) for the relay. */
export type DeviceAuthResult =
  | { ok: true; device: Device }
  | { ok: false; reason: "unauthorized" | "revoked" }

export type GatewayDeviceStore = DeviceStore & {
  authenticateDevice(deviceId: string, credential: string): Promise<DeviceAuthResult>
}

export function createDeviceStore(client: ControlPlaneClient): GatewayDeviceStore {
  /**
   * The `DeviceStore.get` port stays fail-closed: a revoked device reads as
   * absent. Only `authenticateDevice` below needs the real status, because it
   * is the one caller that has to tell "revoked" (4003, stop reconnecting) from
   * "wrong credential" (4001, re-pair).
   */
  async function get(deviceId: string): Promise<Device | null> {
    const device = toDevice(await client.query(REFS.devicesGetRecord, { deviceId }))
    return device === null || device.status === "revoked" ? null : device
  }

  async function authenticateDevice(
    deviceId: string,
    credential: string,
  ): Promise<DeviceAuthResult> {
    const record = toDeviceRecord(await client.query(REFS.devicesGetRecord, { deviceId }))
    if (!record) return { ok: false, reason: "unauthorized" }

    // The KDF runs before the status branch, so a revoked device is not
    // distinguishable by timing from a wrong secret.
    const verified = await verifyDeviceCredential(credential, {
      deviceId: record.id,
      credentialHash: record.credentialHash,
      status: record.status,
      credentialVersion: record.credentialVersion,
    })
    if (record.status === "revoked") return { ok: false, reason: "revoked" }
    if (!verified) return { ok: false, reason: "unauthorized" }

    const { credentialHash: _hash, ...device } = record
    return { ok: true, device }
  }

  return {
    get,
    listForUser: async (userId: string) =>
      toDevices(await client.query(REFS.devicesListForUser, { userId })),
    authenticate: async (deviceId: string, credential: string) => {
      const result = await authenticateDevice(deviceId, credential)
      return result.ok ? result.device : null
    },
    setPresence: async (deviceId: string, online: boolean, capabilities?: string[]) => {
      const args = capabilities ? { deviceId, online, capabilities } : { deviceId, online }
      await client.mutation(REFS.devicesSetPresence, args)
    },
    revoke: async () => {
      // Revocation is a USER action: apps/web calls features/devices/mutations:revoke
      // with a @convex-dev/auth session. The gateway holds a service token, which
      // must never be usable to act on a user's behalf.
      throw new GatewayError("NOT_AUTHORIZED", "Devices are revoked from the dashboard.")
    },
    authenticateDevice,
  }
}
