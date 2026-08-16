/**
 * The agent is an untrusted-by-default peer running on a user machine, so its
 * result is validated and scrubbed before it becomes an ExecutionResult.
 */
import { GatewayError } from "@cg/core"
import type { ExecutionResult } from "@cg/core"
import type { AgentResult } from "@cg/protocol"
import { errorResult, isErrorCode, normalizeFiles, successResult } from "./result"
import { stripPaths } from "@cg/observability"

const MAX_MESSAGE_LENGTH = 300

const malformed = (): GatewayError =>
  new GatewayError("UPSTREAM_ERROR", "The device returned a malformed result.")

export function isAgentResult(value: unknown): value is AgentResult {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.jobId !== "string" || candidate.jobId.length === 0) return false
  if (candidate.status !== "success" && candidate.status !== "error") return false
  if (typeof candidate.timingMs !== "number" || !Number.isFinite(candidate.timingMs)) return false
  return true
}

/** `timingMs` is the gateway-observed round trip, not the agent's self-report. */
export function toExecutionResult(
  value: unknown,
  expectedJobId: string,
  timingMs: number,
): ExecutionResult {
  if (!isAgentResult(value)) throw malformed()
  if (value.jobId !== expectedJobId) {
    throw new GatewayError("INTERNAL", "The device returned a result for a different job.")
  }
  if (value.status === "error") {
    const code = isErrorCode(value.error?.code) ? value.error.code : "UPSTREAM_ERROR"
    return errorResult(code, agentMessage(value.error?.message), timingMs)
  }
  return successResult(value.output, normalizeFiles(value.files, malformed()), timingMs)
}

/**
 * Agent-authored text can name local files, so it is scrubbed and capped.
 *
 * CAP FIRST, then scrub. `AgentResult.error.message` is only length-bounded by
 * the 1 MiB frame limit, and the path regexes cost roughly 0.4s of gateway CPU
 * on a megabyte of `/a/a/a/…`. Scrubbing the full string before throwing 99.97%
 * of it away let one compromised device spend every tenant's CPU. A path that
 * straddles the cut is truncated away with the rest, and anything still inside
 * the window is scrubbed exactly as before.
 */
function agentMessage(message: unknown): string {
  if (typeof message !== "string" || message.trim().length === 0) {
    return "The device could not complete this action."
  }
  return stripPaths(message.slice(0, MAX_MESSAGE_LENGTH)).slice(0, MAX_MESSAGE_LENGTH)
}
