/**
 * Relay socket state (docs/05-local-agent-protocol.md).
 * A freshly opened socket is UNAUTHENTICATED and may send exactly one frame
 * type — `hello` — before the deadline closes it.
 */
import type { ServerWebSocket } from "bun"
import type { GatewayMessage } from "@cg/protocol"

/** A socket that has not said hello in time is closed, not left hanging. */
export const HELLO_DEADLINE_MS = 10_000

export type SocketState = {
  socketId: string
  deviceId: string | null
  authenticated: boolean
  /** epoch ms of the last frame received; drives the heartbeat timeout. */
  lastSeenAt: number
  helloTimer: ReturnType<typeof setTimeout> | null
}

export type RelaySocket = ServerWebSocket<SocketState>

export function newSocketState(socketId: string, now: number): SocketState {
  return { socketId, deviceId: null, authenticated: false, lastSeenAt: now, helloTimer: null }
}

/** A send failure means the socket is already gone; it is never fatal here. */
export function sendMessage(socket: RelaySocket, message: GatewayMessage): boolean {
  try {
    socket.send(JSON.stringify(message))
    return true
  } catch {
    return false
  }
}
