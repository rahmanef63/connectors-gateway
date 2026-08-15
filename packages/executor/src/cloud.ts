/**
 * Cloud execution: gateway → adapter → remote service (docs/02).
 * The resolved credential exists only inside `execute` and only reaches the
 * adapter — never a result, never an error, never a log (AGENTS.md #5).
 */
import { GatewayError } from "@cg/core"
import type {
  ConnectionCredential,
  ExecutionRequest,
  ExecutionResult,
  Executor,
} from "@cg/core"
import { toFailureResult } from "./failure"
import { normalizeAdapterOutput, successResult } from "./result"
import { DEFAULT_EXECUTION_TIMEOUT_MS } from "./types"
import type { CloudAdapter, CloudExecutorDeps } from "./types"

export function createCloudExecutor(deps: CloudExecutorDeps): Executor {
  const fallbackTimeout = deps.defaultTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS

  return {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      const startedAt = performance.now()
      let signal: AbortSignal | undefined
      try {
        const adapter = requireAdapter(deps.adapters, request.connector.id)
        const credential = await resolveCredential(deps, request)
        signal = AbortSignal.timeout(request.timeoutMs ?? fallbackTimeout)

        const raw = await adapter.execute(request.action.id, request.input, {
          requestId: request.context.requestId,
          credential,
          signal,
        })
        const { output, files } = normalizeAdapterOutput(raw)
        return successResult(output, files, performance.now() - startedAt)
      } catch (cause) {
        return toFailureResult(cause, {
          timingMs: performance.now() - startedAt,
          fallbackMessage: "The connector could not complete this action.",
          signal,
        })
      }
    },
  }
}

function requireAdapter(adapters: Map<string, CloudAdapter>, connectorId: string): CloudAdapter {
  const adapter = adapters.get(connectorId)
  if (!adapter) {
    throw new GatewayError("CONNECTOR_NOT_FOUND", `Connector "${connectorId}" is not available.`)
  }
  return adapter
}

/**
 * Identity comes from the authenticated principal, never from the request body:
 * the connection is looked up for `principal.userId` only.
 */
async function resolveCredential(
  deps: CloudExecutorDeps,
  request: ExecutionRequest,
): Promise<ConnectionCredential> {
  const connectorId = request.connector.id
  const stored = await deps.connections.resolveCredential(
    request.context.principal.userId,
    connectorId,
  )
  if (!stored) {
    throw new GatewayError(
      "CONNECTION_MISSING",
      `No active connection for connector "${connectorId}". Connect it first.`,
    )
  }
  const token = await deps.openCredential(stored.token)
  if (typeof token !== "string" || token.length === 0) {
    throw new GatewayError("CONNECTION_MISSING", "The stored connection credential is unusable.")
  }
  return { connectionId: stored.connectionId, baseUrl: stored.baseUrl, token }
}
