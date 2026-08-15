/**
 * What the user's currently connected devices can do.
 *
 * Used by two callers (policy evaluation and the catalog), so it lives here
 * rather than being written twice. Only ONLINE devices count: an offline
 * device's last-known capability list must not authorize an action that would
 * then fail with DEVICE_OFFLINE anyway.
 */
import type { Device, DeviceStore } from "@cg/core"

export function announcedCapabilities(devices: readonly Device[]): string[] {
  const capabilities = new Set<string>()
  for (const device of devices) {
    if (device.status !== "online") continue
    for (const capability of device.capabilities) capabilities.add(capability)
  }
  return [...capabilities]
}

export async function deviceCapabilitiesFor(
  devices: DeviceStore,
  userId: string,
): Promise<string[]> {
  return announcedCapabilities(await devices.listForUser(userId))
}

/** Connector ids at least one online device announces, e.g. `blender:scene.render`. */
export function connectorsWithCapabilities(capabilities: readonly string[]): string[] {
  const ids = new Set<string>()
  for (const capability of capabilities) {
    const separator = capability.indexOf(":")
    if (separator > 0) ids.add(capability.slice(0, separator))
  }
  return [...ids]
}
