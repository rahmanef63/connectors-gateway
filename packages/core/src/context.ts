/**
 * Request/execution context. Identity is attached server-side and is NEVER
 * read from AI-supplied arguments (docs/05, docs/07).
 */
import type { ActionDefinition, ConnectorManifest } from "./connector"
import type { ErrorCode } from "./errors"

/** The authenticated caller: an AI client acting for exactly one user. */
export type Principal = {
  /** Identifier of the AI client / API key that authenticated. */
  callerId: string
  userId: string
  workspaceId?: string
  scopes: string[]
}

export type RequestContext = {
  requestId: string
  principal: Principal
  /** epoch ms */
  receivedAt: number
}

/** A file produced by an action. `ref` is a gateway-controlled handle, never a local path. */
export type ResultFile = {
  name: string
  mimeType: string
  sizeBytes: number
  ref: string
  expiresAt?: number
}

export type ExecutionRequest = {
  context: RequestContext
  connector: ConnectorManifest
  action: ActionDefinition
  /** Already validated against `action.inputSchema`. */
  input: unknown
  /** Local executions only: the resolved target device. */
  deviceId?: string
  timeoutMs?: number
}

export type ExecutionResult = {
  status: "success" | "error"
  output?: unknown
  files?: ResultFile[]
  error?: { code: ErrorCode; message: string }
  timingMs: number
}

export interface Executor {
  execute(request: ExecutionRequest): Promise<ExecutionResult>
}
