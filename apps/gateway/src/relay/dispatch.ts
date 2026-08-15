/**
 * JobDispatcher: the in-process bridge from @cg/executor to a live device
 * socket. Because HTTP and the relay share one Bun process, dispatch is a
 * function call — no queue, no broker (docs/01).
 *
 * Every path deletes its pending entry: resolve, timeout, send failure and
 * socket close. A leaked entry would pin a promise forever.
 */
import { GatewayError } from "@cg/core"
import type { Logger } from "@cg/observability"
import type { AgentResult, SignedJob } from "@cg/protocol"
import type { JobDispatcher } from "@cg/executor"
import type { SocketRegistry } from "./sockets"
import { sendMessage } from "./types"

/** Upper bound on how long one job may occupy a pending slot. */
export const MAX_DISPATCH_TIMEOUT_MS = 300_000

type Pending = {
  deviceId: string
  resolve: (result: AgentResult) => void
  reject: (error: GatewayError) => void
  timer: ReturnType<typeof setTimeout>
}

export type Dispatcher = JobDispatcher & {
  /** Called by the relay for every inbound `result` frame. */
  settle(deviceId: string, result: AgentResult): boolean
  /** Fails everything still waiting on a device that just went away. */
  failDevice(deviceId: string, error: GatewayError): number
  pendingCount(): number
}

export function createDispatcher(deps: {
  sockets: SocketRegistry
  logger: Logger
}): Dispatcher {
  const pending = new Map<string, Pending>()

  function clear(jobId: string): Pending | undefined {
    const entry = pending.get(jobId)
    if (entry) {
      clearTimeout(entry.timer)
      pending.delete(jobId)
    }
    return entry
  }

  return {
    dispatch(deviceId: string, job: SignedJob, timeoutMs: number): Promise<AgentResult> {
      const jobId = job.payload.id
      const socket = deps.sockets.get(deviceId)
      if (!socket) {
        return Promise.reject(
          new GatewayError("DEVICE_OFFLINE", "The device is not connected."),
        )
      }
      if (pending.has(jobId)) {
        return Promise.reject(new GatewayError("REPLAY_DETECTED", "This job is already in flight."))
      }
      const budget = Number.isFinite(timeoutMs)
        ? Math.min(Math.max(timeoutMs, 1), MAX_DISPATCH_TIMEOUT_MS)
        : MAX_DISPATCH_TIMEOUT_MS

      return new Promise<AgentResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(jobId)
          // Tell the agent to stop working; docs/05 requires cancellation.
          sendMessage(socket, { type: "cancel", jobId })
          deps.logger.warn("job dispatch timed out", { deviceId, jobId })
          reject(new GatewayError("TIMEOUT", "The device did not answer in time."))
        }, budget)

        pending.set(jobId, { deviceId, resolve, reject, timer })

        if (!sendMessage(socket, { type: "job", job })) {
          clear(jobId)
          reject(new GatewayError("DEVICE_OFFLINE", "The device connection was lost."))
        }
      })
    },

    /**
     * A result for an unknown job id, or for a job dispatched to a DIFFERENT
     * device, is dropped: one compromised agent must not be able to answer
     * another device's job (docs/14).
     */
    settle(deviceId: string, result: AgentResult): boolean {
      const entry = pending.get(result.jobId)
      if (!entry || entry.deviceId !== deviceId) {
        deps.logger.warn("dropped unexpected job result", { deviceId })
        return false
      }
      clear(result.jobId)
      entry.resolve(result)
      return true
    },

    failDevice(deviceId: string, error: GatewayError): number {
      let failed = 0
      for (const [jobId, entry] of [...pending.entries()]) {
        if (entry.deviceId !== deviceId) continue
        clear(jobId)
        entry.reject(error)
        failed += 1
      }
      return failed
    },

    pendingCount: () => pending.size,
  }
}
