/**
 * Local execution: gateway → relay → paired device → local application (docs/02).
 * Nothing here talks to the device directly; a JobDispatcher owns the socket.
 * The device credential and the signing key never enter this module.
 */
import type { ExecutionOutcome, ExecutionRequest, Executor } from "@cg/core"
import { DEFAULT_JOB_TTL_MS, createJobEnvelope } from "@cg/protocol"
import { toExecutionResult } from "./agent-result"
import { toFailureResult } from "./failure"
import { selectDevice } from "./select-device"
import { DEFAULT_EXECUTION_TIMEOUT_MS } from "./types"
import type { LocalExecutorDeps } from "./types"

export function createLocalExecutor(deps: LocalExecutorDeps): Executor {
  const ttlMs = deps.ttlMs ?? DEFAULT_JOB_TTL_MS
  const fallbackTimeout = deps.defaultTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS

  return {
    async execute(request: ExecutionRequest): Promise<ExecutionOutcome> {
      const startedAt = performance.now()
      let deviceId: string | undefined
      try {
        const { principal, requestId } = request.context
        // Only the authenticated user's own devices are ever candidates.
        const devices = await deps.devices.listForUser(principal.userId)
        const { device } = selectDevice({
          devices,
          connectorId: request.connector.id,
          requiredCapabilities: request.action.requiredCapabilities,
          deviceId: request.deviceId,
        })
        deviceId = device.id

        // requestContext is attached server-side; an AI client can never supply it.
        const envelope = createJobEnvelope({
          connector: request.connector.id,
          action: request.action.id,
          input: request.input,
          requestContext: {
            requestId,
            userId: principal.userId,
            workspaceId: principal.workspaceId,
          },
          ttlMs,
        })
        const signed = await deps.signJob(envelope)
        const timeoutMs = request.timeoutMs ?? fallbackTimeout
        const raw = await deps.dispatcher.dispatch(device.id, signed, timeoutMs)

        return {
          ...toExecutionResult(raw, envelope.id, performance.now() - startedAt),
          deviceId,
        }
      } catch (cause) {
        return {
          ...toFailureResult(cause, {
            timingMs: performance.now() - startedAt,
            fallbackMessage: "The device could not complete this action.",
          }),
          ...(deviceId === undefined ? {} : { deviceId }),
        }
      }
    },
  }
}
