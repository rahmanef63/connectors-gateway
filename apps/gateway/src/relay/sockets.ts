/**
 * In-memory presence: deviceId -> live socket.
 *
 * ponytail: single process. Convex holds durable presence via
 * `service/devices:setPresence`; a second relay instance needs a shared routing
 * layer (docs/12 "Scaling boundary"), which changes nothing above this file.
 */
import type { RelaySocket } from "./types"

export type SocketRegistry = {
  get(deviceId: string): RelaySocket | undefined
  /** Returns the socket that was displaced, if the device reconnected. */
  set(deviceId: string, socket: RelaySocket): RelaySocket | undefined
  /** No-op unless `socket` is still the registered one (reconnect-safe). */
  remove(deviceId: string, socket: RelaySocket): boolean
  entries(): [string, RelaySocket][]
  size(): number
}

export function createSocketRegistry(): SocketRegistry {
  const byDevice = new Map<string, RelaySocket>()

  return {
    get: (deviceId) => byDevice.get(deviceId),
    set(deviceId, socket) {
      const previous = byDevice.get(deviceId)
      byDevice.set(deviceId, socket)
      return previous === socket ? undefined : previous
    },
    remove(deviceId, socket) {
      if (byDevice.get(deviceId) !== socket) return false
      byDevice.delete(deviceId)
      return true
    },
    entries: () => [...byDevice.entries()],
    size: () => byDevice.size,
  }
}
