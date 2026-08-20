/**
 * Cloud execution: gateway → adapter → remote service (docs/02).
 * The resolved credential exists only inside `execute` and only reaches the
 * adapter — never a client result, an error message, or a log.
 */
import { GatewayError } from "@cg/core"
import type {
  ConnectionCredential,
  ExecutionOutcome,
  ExecutionRequest,
  Executor,
} from "@cg/core"
import { toFailureResult } from "./failure"
import { normalizeAdapterOutput, successResult } from "./result"
import { DEFAULT_EXECUTION_TIMEOUT_MS } from "./types"
import type { CloudAdapter, CloudExecutorDeps } from "./types"

export function createCloudExecutor(deps: CloudExecutorDeps): Executor {
  const fallbackTimeout = deps.defaultTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS

  return {
    async execute(request: ExecutionRequest): Promise<ExecutionOutcome> {
      const startedAt = performance.now()
      let signal: AbortSignal | undefined
      let connectionId: string | undefined
      try {
        const adapter = requireAdapter(deps.adapters, request.connector.id)
        const stored = await resolveStoredCredential(deps, request)
        connectionId = stored.connectionId
        const credential = await openStoredCredential(deps, stored)
        signal = AbortSignal.timeout(request.timeoutMs ?? fallbackTimeout)

        const raw = await adapter.execute(request.action.id, request.input, {
          requestId: request.context.requestId,
          credential,
          signal,
        })
        const { output, files } = normalizeAdapterOutput(raw)
        return {
          ...successResult(output, files, performance.now() - startedAt),
          connectionId,
        }
      } catch (cause) {
        return {
          ...toFailureResult(cause, {
            timingMs: performance.now() - startedAt,
            fallbackMessage: "The connector could not complete this action.",
            signal,
          }),
          ...(connectionId === undefined ? {} : { connectionId }),
        }
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
 * the connection is looked up for `principal.userId` only. The token is still
 * sealed here; separating lookup from opening lets audit retain the row id even
 * when key configuration makes decryption fail.
 */
async function resolveStoredCredential(
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
  return stored
}

async function openStoredCredential(
  deps: CloudExecutorDeps,
  stored: ConnectionCredential,
): Promise<ConnectionCredential> {
  const token = await deps.openCredential(stored.token)
  if (typeof token !== "string" || token.length === 0) {
    throw new GatewayError("CONNECTION_MISSING", "The stored connection credential is unusable.")
  }
  return { connectionId: stored.connectionId, baseUrl: stored.baseUrl, token }
}
