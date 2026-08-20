/**
 * The device relay: Bun WebSocket handlers + presence + dispatch, in the same
 * process as the HTTP edge so job dispatch is an in-process call (docs/01).
 *
 * A socket is untrusted until `hello` has been verified. Nothing derived from
 * an unauthenticated frame is ever stored, and no frame body is ever logged —
 * `hello` carries a device credential.
 */
import { GatewayError, PRESENCE_REFRESH_MS, newId } from "@cg/core"
import type { Logger } from "@cg/observability"
import { CLOSE_CODES, HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS, PROTOCOL_VERSION, parseAgentMessage } from "@cg/protocol"
import type { AgentMessage, SignedKeyRotation } from "@cg/protocol"
import type { WebSocketHandler } from "bun"
import type { GatewayDeviceStore } from "../store/devices"
import { createDispatcher } from "./dispatch"
import type { Dispatcher } from "./dispatch"
import { authenticateHello, flattenCapabilities } from "./hello"
import { createSocketRegistry } from "./sockets"
import type { SocketRegistry } from "./sockets"
import { HELLO_DEADLINE_MS, newSocketState, sendMessage } from "./types"
import type { RelaySocket, SocketState } from "./types"

export type RelayDeps = {
  devices: GatewayDeviceStore
  logger: Logger
  /** base64 SPKI, handed to the agent so it can verify job signatures. */
  signingPublicKey: string
  keyId: string
  keyRotation?: SignedKeyRotation
  now?: () => number
}

export type Relay = {
  websocket: WebSocketHandler<SocketState>
  dispatcher: Dispatcher
  sockets: SocketRegistry
  /** State attached at upgrade time. */
  newState(): SocketState
  /** Close sessions whose durable device row was revoked or removed. */
  revalidate(): Promise<number>
  sweep(): number
  stop(): void
}

export function createRelay(deps: RelayDeps): Relay {
  const now = deps.now ?? Date.now
  const sockets = createSocketRegistry()
  const dispatcher = createDispatcher({ sockets, logger: deps.logger })

  function disconnect(socket: RelaySocket, code: number, reason: string): void {
    clearHelloTimer(socket)
    socket.close(code, reason)
  }

  function clearHelloTimer(socket: RelaySocket): void {
    if (socket.data.helloTimer) {
      clearTimeout(socket.data.helloTimer)
      socket.data.helloTimer = null
    }
  }

  async function onHello(socket: RelaySocket, message: AgentMessage): Promise<void> {
    if (message.type !== "hello") return
    const outcome = await authenticateHello(deps.devices, message)
    if (!outcome.ok) {
      deps.logger.warn("device handshake rejected", { code: outcome.code })
      disconnect(socket, outcome.code, outcome.reason)
      return
    }

    const deviceId = outcome.device.id
    clearHelloTimer(socket)
    socket.data.deviceId = deviceId
    socket.data.authenticated = true
    socket.data.lastSeenAt = now()

    const displaced = sockets.set(deviceId, socket)
    if (displaced) displaced.close(CLOSE_CODES.UNAUTHORIZED, "replaced by a newer session")

    await deps.devices.setPresence(deviceId, true, outcome.capabilities)
    socket.data.presenceAt = socket.data.lastSeenAt
    sendMessage(socket, {
      type: "welcome",
      deviceId,
      protocolVersion: PROTOCOL_VERSION,
      signingPublicKey: deps.signingPublicKey,
      keyId: deps.keyId,
      ...(deps.keyRotation === undefined ? {} : { keyRotation: deps.keyRotation }),
    })
    deps.logger.info("device online", { deviceId, capabilities: outcome.capabilities.length })
  }

  async function onAuthenticatedFrame(socket: RelaySocket, message: AgentMessage): Promise<void> {
    const deviceId = socket.data.deviceId
    if (!deviceId) return
    socket.data.lastSeenAt = now()

    switch (message.type) {
      case "heartbeat":
        // Presence in Convex is a claim that expires (PRESENCE_TTL_MS), so a
        // live session has to keep re-stamping it — otherwise every connected
        // device would read as offline once its hello aged out. Throttled, so
        // this costs one mutation per device per PRESENCE_REFRESH_MS rather
        // than one per heartbeat.
        await refreshPresence(socket, deviceId)
        return
      case "capabilities":
        await deps.devices.setPresence(deviceId, true, flattenCapabilities(message.capabilities))
        socket.data.presenceAt = socket.data.lastSeenAt
        return
      case "result":
        dispatcher.settle(deviceId, message.result)
        return
      case "hello":
        // A second hello on an authenticated socket is a protocol violation.
        disconnect(socket, CLOSE_CODES.UNSUPPORTED, "already authenticated")
        return
    }
  }

  /**
   * Re-stamp durable presence, at most once per PRESENCE_REFRESH_MS.
   *
   * A failed write is logged and swallowed: presence is soft state, and a
   * Convex hiccup must not tear down a healthy device session. The stale row
   * expires on its own, which is the whole point of the TTL.
   */
  async function refreshPresence(socket: RelaySocket, deviceId: string): Promise<void> {
    const at = socket.data.lastSeenAt
    if (at - socket.data.presenceAt < PRESENCE_REFRESH_MS) return
    // Claim the slot before awaiting, so concurrent heartbeats cannot stack up
    // into a burst of identical writes.
    socket.data.presenceAt = at
    try {
      await deps.devices.setPresence(deviceId, true)
    } catch (cause) {
      socket.data.presenceAt = 0
      deps.logger.warn("presence refresh failed", {
        deviceId,
        error: cause instanceof Error ? cause.message : "unknown",
      })
    }
  }

  const websocket: WebSocketHandler<SocketState> = {
    open(socket) {
      socket.data.lastSeenAt = now()
      socket.data.helloTimer = setTimeout(() => {
        if (!socket.data.authenticated) {
          socket.close(CLOSE_CODES.UNAUTHORIZED, "hello deadline exceeded")
        }
      }, HELLO_DEADLINE_MS)
    },

    async message(socket, raw) {
      if (typeof raw !== "string") {
        disconnect(socket, CLOSE_CODES.UNSUPPORTED, "binary frames are not supported")
        return
      }
      let message: AgentMessage
      try {
        message = parseAgentMessage(raw)
      } catch {
        // The frame body is never echoed or logged: it may carry a credential.
        if (!socket.data.authenticated) {
          disconnect(socket, CLOSE_CODES.UNAUTHORIZED, "invalid frame")
          return
        }
        sendMessage(socket, { type: "error", code: "INVALID_INPUT", message: "Invalid frame." })
        return
      }

      if (!socket.data.authenticated) {
        if (message.type !== "hello") {
          disconnect(socket, CLOSE_CODES.UNAUTHORIZED, "hello required")
          return
        }
        await onHello(socket, message)
        return
      }
      await onAuthenticatedFrame(socket, message)
    },

    close(socket) {
      clearHelloTimer(socket)
      const deviceId = socket.data.deviceId
      if (!deviceId || !sockets.remove(deviceId, socket)) return
      dispatcher.failDevice(deviceId, new GatewayError("DEVICE_OFFLINE", "The device disconnected."))
      deps.devices
        .setPresence(deviceId, false)
        .catch(() => deps.logger.error("presence update failed", { deviceId }))
      deps.logger.info("device offline", { deviceId })
    },
  }

  /**
   * Re-read the durable device row for every connected socket.
   *
   * Revocation happens in the web control plane, while sockets live in this Bun
   * process. Polling at the same cadence as presence refresh gives revocation a
   * bounded delay without adding a push broker. A control-plane outage does not
   * disconnect a healthy workstation: the next pass retries. The registry
   * identity check after `await` is load-bearing — a reconnect must never let an
   * old sweep close the replacement socket.
   */
  let revalidationInFlight: Promise<number> | null = null
  function revalidate(): Promise<number> {
    if (revalidationInFlight !== null) return revalidationInFlight

    revalidationInFlight = (async () => {
      let closed = 0
      for (const [deviceId, socket] of sockets.entries()) {
        let current
        try {
          current = await deps.devices.get(deviceId)
        } catch (cause) {
          deps.logger.warn("device revalidation failed", {
            deviceId,
            error: cause instanceof Error ? cause.message : "unknown",
          })
          continue
        }

        // The socket may have reconnected while the control-plane read was in
        // flight. Only act if this exact object still owns the device slot.
        if (sockets.get(deviceId) !== socket) continue
        if (current !== null) continue

        // Remove first: dispatch must fail immediately even if the WebSocket
        // implementation reports its close event on a later turn.
        if (!sockets.remove(deviceId, socket)) continue
        dispatcher.failDevice(
          deviceId,
          new GatewayError("DEVICE_REVOKED", "The device was revoked."),
        )
        sendMessage(socket, { type: "revoked", reason: "Device access was revoked." })
        socket.data.authenticated = false
        disconnect(socket, CLOSE_CODES.REVOKED, "device revoked")
        deps.logger.info("revoked device disconnected", { deviceId })
        closed += 1
      }
      return closed
    })().finally(() => {
      revalidationInFlight = null
    })

    return revalidationInFlight
  }

  /** Closes sockets that stopped heartbeating (docs/05 "Heartbeats maintain presence"). */
  function sweep(): number {
    const deadline = now() - HEARTBEAT_TIMEOUT_MS
    let closed = 0
    for (const [, socket] of sockets.entries()) {
      if (socket.data.lastSeenAt > deadline) continue
      socket.close(CLOSE_CODES.UNAUTHORIZED, "heartbeat timeout")
      closed += 1
    }
    return closed
  }

  const heartbeat = setInterval(sweep, HEARTBEAT_INTERVAL_MS)
  const revocation = setInterval(() => {
    void revalidate()
  }, PRESENCE_REFRESH_MS)

  return {
    websocket,
    dispatcher,
    sockets,
    newState: () => newSocketState(newId("nonce"), now()),
    revalidate,
    sweep,
    stop: () => {
      clearInterval(heartbeat)
      clearInterval(revocation)
    },
  }
}
