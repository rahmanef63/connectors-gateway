/**
 * One failure-mapping rule for both executors: a thrown value becomes an
 * ExecutionResult with a closed-vocabulary code and a message that carries no
 * internal detail (docs/03, P0 — never leak upstream text, paths, or tokens).
 */
import { GatewayError } from "@cg/core"
import type { ExecutionResult } from "@cg/core"
import { errorResult } from "./result"

const ABORT_NAMES = new Set(["TimeoutError", "AbortError"])

export type FailureContext = {
  timingMs: number
  /** Shown when the cause is not a GatewayError. Must stay generic. */
  fallbackMessage: string
  /** The budget signal, when one was armed for this attempt. */
  signal?: AbortSignal
}

export function toFailureResult(cause: unknown, context: FailureContext): ExecutionResult {
  // The only abort source is our own budget, so an aborted signal means timeout
  // regardless of what the adapter chose to throw on the way out.
  if (context.signal?.aborted) return errorResult("TIMEOUT", "The action timed out.", context.timingMs)
  if (cause instanceof GatewayError) return errorResult(cause.code, cause.message, context.timingMs)
  if (cause instanceof Error && ABORT_NAMES.has(cause.name)) {
    return errorResult("TIMEOUT", "The action timed out.", context.timingMs)
  }
  return errorResult("UPSTREAM_ERROR", context.fallbackMessage, context.timingMs)
}
