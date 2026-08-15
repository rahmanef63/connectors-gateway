/**
 * The outbound device session (docs/05 "Connection lifecycle").
 *
 * The agent DIALS OUT and never listens: there is no server, no bind and no
 * inbound port anywhere in this app (AGENTS.md invariants 1 and 2, docs/01 "Why
 * local apps do not need a public IP"). Everything the gateway wants to do to
 * this machine has to arrive as a frame on a socket this process opened.
 *
 * Inbound frame handling lives in session-inbound.ts; this file owns dialling,
 * announcing, heartbeating and reconnecting.
 */
import type { DevicePlatform } from "@cg/core"
import { CLOSE_CODES } from "@cg/protocol"
import type { AgentMessage } from "@cg/protocol"
import type { AdapterRegistry } from "./adapters"
import { backoffDelay } from "./backoff"
import type { AgentConfig } from "./config"
import { HEARTBEAT_FRAME, encodeFrame, helloFrame } from "./frames"
import { createHeartbeat } from "./heartbeat"
import type { Heartbeat } from "./heartbeat"
import { detectPlatform } from "./identity"
import type { JobRunner } from "./jobs"
import { createKeyTruster } from "./key-store"
import type { KeyStore } from "./key-store"
import type { Logger } from "./log"
import { silentLogger } from "./log"
import { createInboundHandler } from "./session-inbound"
import type { AgentSocket, SocketFactory } from "./socket"
import { NORMAL_CLOSURE, webSocketFactory } from "./socket"

export type ConnectionState = "idle" | "connecting" | "online" | "offline" | "stopped"

/** Close codes that mean "re-pair", not "retry" — reconnecting would be abuse. */
export const PERMANENT_CLOSE_CODES: readonly number[] = Object.freeze([
  CLOSE_CODES.UNAUTHORIZED,
  CLOSE_CODES.REVOKED,
  CLOSE_CODES.UNSUPPORTED,
])

export type SessionOptions = {
  config: AgentConfig
  registry: AdapterRegistry
  runner: JobRunner
  /** Pins the gateway's signing key on first use; omit to ignore key announcements. */
  keys?: KeyStore
  platform?: DevicePlatform
  connect?: SocketFactory
  logger?: Logger
  random?: () => number
  schedule?: (fn: () => void, ms: number) => void
}

export type Session = {
  start(): void
  stop(): void
  state(): ConnectionState
  attempts(): number
}

export function createSession(options: SessionOptions): Session {
  const { config, registry, runner } = options
  const connect = options.connect ?? webSocketFactory
  const logger = options.logger ?? silentLogger
  const schedule = options.schedule ?? ((fn, ms) => void setTimeout(fn, ms))
  const platform = options.platform ?? detectPlatform()
  const trustKey = createKeyTruster(options.keys, logger)

  let socket: AgentSocket | undefined
  let heartbeat: Heartbeat | undefined
  let state: ConnectionState = "idle"
  let generation = 0
  let attempt = 0
  let stopped = false

  /** A frame write must never escape as an exception: the session outlives it. */
  const send = (message: AgentMessage): void => {
    try {
      socket?.send(encodeFrame(message))
    } catch {
      logger.warn("a frame could not be sent; the session will reconnect")
    }
  }

  const halt = (): void => {
    stopped = true
    state = "stopped"
    generation += 1
    heartbeat?.stop()
    heartbeat = undefined
    socket?.close(NORMAL_CLOSURE, "stopping")
    socket = undefined
  }

  const open = (): void => {
    generation += 1
    const gen = generation
    const isCurrent = (): boolean => gen === generation
    state = "connecting"

    heartbeat = createHeartbeat({
      send: () => send(HEARTBEAT_FRAME),
      onTimeout: () => {
        logger.warn("the gateway stopped answering; reconnecting")
        socket?.close(NORMAL_CLOSURE, "heartbeat timeout")
        onClose(gen, NORMAL_CLOSURE)
      },
    })

    const handleFrame = createInboundHandler({
      deviceId: config.deviceId,
      runner,
      logger,
      send,
      isCurrent,
      stop: halt,
      trustKey,
      onOnline: () => {
        state = "online"
        attempt = 0
        logger.info(`online as device ${config.deviceId}`)
      },
    })

    socket = connect(config.gatewayUrl, {
      open: () => void announce(gen),
      message: (data) => {
        heartbeat?.onFrame()
        void handleFrame(data)
      },
      close: (code) => onClose(gen, code),
      // The error event carries nothing safe to print; close follows it.
      error: () => logger.warn("the gateway session reported an error"),
    })
  }

  /** Capabilities are re-detected on every connect, so a restarted app is picked up. */
  const announce = async (gen: number): Promise<void> => {
    if (gen !== generation) return
    try {
      const reports = await registry.detectAll()
      if (gen !== generation) return
      send(helloFrame(config, platform, reports))
      heartbeat?.start()
    } catch {
      logger.error("capability detection failed; reconnecting")
      socket?.close(NORMAL_CLOSURE, "detect failed")
      onClose(gen, NORMAL_CLOSURE)
    }
  }

  const onClose = (gen: number, code: number): void => {
    if (gen !== generation) return
    generation += 1 // invalidates every later event from this socket
    heartbeat?.stop()
    heartbeat = undefined
    socket = undefined
    if (stopped) {
      state = "stopped"
      return
    }
    if (PERMANENT_CLOSE_CODES.includes(code)) {
      logger.error(closeAdvice(code))
      halt()
      return
    }
    state = "offline"
    attempt += 1
    const delayMs =
      options.random === undefined ? backoffDelay(attempt) : backoffDelay(attempt, { random: options.random })
    logger.info(`disconnected (code ${code}); retrying in ${delayMs} ms`)
    schedule(() => {
      if (!stopped) open()
    }, delayMs)
  }

  return {
    start(): void {
      if (stopped || state !== "idle") return
      open()
    },
    stop(): void {
      halt()
    },
    state: () => state,
    attempts: () => attempt,
  }
}

export function closeAdvice(code: number): string {
  if (code === CLOSE_CODES.REVOKED) {
    return "this device was revoked. Run: agent revoke-local, then agent pair"
  }
  if (code === CLOSE_CODES.UNSUPPORTED) {
    return "the gateway does not support this agent's protocol version. Upgrade the agent"
  }
  return "the device credential was rejected. Run: agent revoke-local, then agent pair"
}
