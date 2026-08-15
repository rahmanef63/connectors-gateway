/**
 * Local execution: gateway → relay → paired device → local application (docs/02).
 * Nothing here talks to the device directly; a JobDispatcher owns the socket.
 * The device credential and the signing key never enter this module.
 */
import { newId, randomToken } from "@cg/core"
import type { ExecutionRequest, ExecutionResult, Executor } from "@cg/core"
import { DEFAULT_JOB_TTL_MS, PROTOCOL_VERSION } from "@cg/protocol"
import type { JobEnvelope } from "@cg/protocol"
import { toExecutionResult } from "./agent-result"
import { toFailureResult } from "./failure"
import { selectDevice } from "./select-device"
import { DEFAULT_EXECUTION_TIMEOUT_MS } from "./types"
import type { LocalExecutorDeps } from "./types"

export function createLocalExecutor(deps: LocalExecutorDeps): Executor {
  const ttlMs = deps.ttlMs ?? DEFAULT_JOB_TTL_MS
  const fallbackTimeout = deps.defaultTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS

  return {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      const startedAt = performance.now()
      try {
        const { principal } = request.context
        // Only the authenticated user's own devices are ever candidates.
        const devices = await deps.devices.listForUser(principal.userId)
        const { device } = selectDevice({
          devices,
          connectorId: request.connector.id,
          requiredCapabilities: request.action.requiredCapabilities,
          deviceId: request.deviceId,
        })

        const envelope = buildEnvelope(request, ttlMs)
        const signed = await deps.signJob(envelope)
        const timeoutMs = request.timeoutMs ?? fallbackTimeout
        const raw = await deps.dispatcher.dispatch(device.id, signed, timeoutMs)

        return toExecutionResult(raw, envelope.id, performance.now() - startedAt)
      } catch (cause) {
        return toFailureResult(cause, {
          timingMs: performance.now() - startedAt,
          fallbackMessage: "The device could not complete this action.",
        })
      }
    },
  }
}

/** requestContext is attached server-side; an AI client can never supply it. */
function buildEnvelope(request: ExecutionRequest, ttlMs: number): JobEnvelope {
  const { principal, requestId } = request.context
  const issuedAt = Date.now()
  const envelope: JobEnvelope = {
    id: newId("job"),
    protocolVersion: PROTOCOL_VERSION,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
    connector: request.connector.id,
    action: request.action.id,
    input: request.input,
    requestContext: { requestId, userId: principal.userId },
    nonce: randomToken(16),
  }
  if (principal.workspaceId !== undefined) {
    envelope.requestContext.workspaceId = principal.workspaceId
  }
  return envelope
}
