/**
 * Presence keepalive (docs/05: "Heartbeats maintain presence").
 *
 * Two halves: send a heartbeat every interval, and notice when the gateway has
 * stopped answering. A silent TCP connection is the normal failure mode behind
 * NAT — without the watchdog the agent looks online while delivering nothing.
 */
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS } from "@cg/protocol"

export type HeartbeatOptions = {
  send(): void
  /** Called once when no frame has arrived within the timeout. */
  onTimeout(): void
  intervalMs?: number
  timeoutMs?: number
  now?: () => number
}

export type Heartbeat = {
  start(): void
  /** Any inbound frame counts as liveness, not just a reply. */
  onFrame(): void
  stop(): void
}

export function createHeartbeat(options: HeartbeatOptions): Heartbeat {
  const intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS
  const timeoutMs = options.timeoutMs ?? HEARTBEAT_TIMEOUT_MS
  const now = options.now ?? Date.now
  let timer: ReturnType<typeof setInterval> | undefined
  let lastFrameAt = now()

  const stop = (): void => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }

  return {
    start(): void {
      stop()
      lastFrameAt = now()
      timer = setInterval(() => {
        if (now() - lastFrameAt > timeoutMs) {
          stop()
          options.onTimeout()
          return
        }
        options.send()
      }, intervalMs)
      // Node/Bun: a keepalive timer must not hold the process open by itself.
      // `unref` exists on both runtimes' timer handles but is not in lib.es2023.
      ;(timer as unknown as { unref?: () => void }).unref?.()
    },
    onFrame(): void {
      lastFrameAt = now()
    },
    stop,
  }
}
