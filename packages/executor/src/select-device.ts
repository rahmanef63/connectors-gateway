/**
 * Device selection for a local execution.
 *
 * DEVICE_OFFLINE and CAPABILITY_UNAVAILABLE are deliberately distinct: the
 * first is retryable once the user's machine comes back, the second never is.
 * The AI's retry behaviour hangs on that difference (docs/02, docs/05).
 */
import { GatewayError } from "@cg/core"
import type { Device } from "@cg/core"

export type DeviceSelection = {
  device: Device
  /** Fully qualified capabilities the action demanded. */
  required: string[]
}

/** `scene.render` on connector `blender` is announced as `blender:scene.render`. */
export function namespaceCapabilities(connectorId: string, capabilities: string[]): string[] {
  const prefix = `${connectorId}:`
  return capabilities.map((capability) =>
    capability.startsWith(prefix) ? capability : prefix + capability,
  )
}

/**
 * `devices` must already be the authenticated user's own devices — ownership is
 * never inferred from a caller-supplied field.
 */
export function selectDevice(input: {
  devices: Device[]
  connectorId: string
  requiredCapabilities?: string[]
  /** Gateway-resolved target, when the request pins one. */
  deviceId?: string
}): DeviceSelection {
  const pool = input.deviceId
    ? input.devices.filter((device) => device.id === input.deviceId)
    : input.devices

  const online = pool.filter((device) => device.status === "online")
  if (online.length === 0) throw offlineError(pool)

  const required = namespaceCapabilities(input.connectorId, input.requiredCapabilities ?? [])
  const capable = online.filter((device) => hasEvery(device, required))
  const device = capable[0]
  if (!device) {
    throw new GatewayError(
      "CAPABILITY_UNAVAILABLE",
      `No connected device reports the capabilities required by this action.`,
      { required },
    )
  }
  return { device, required }
}

function hasEvery(device: Device, required: string[]): boolean {
  const announced = new Set(device.capabilities)
  return required.every((capability) => announced.has(capability))
}

function offlineError(pool: Device[]): GatewayError {
  if (pool.length > 0 && pool.every((device) => device.status === "revoked")) {
    return new GatewayError("DEVICE_REVOKED", "This device has been revoked.")
  }
  return new GatewayError("DEVICE_OFFLINE", "No device is currently connected for this connector.")
}
