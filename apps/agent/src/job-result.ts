/**
 * Building the `AgentResult` frame.
 *
 * Two duties: an error is always a structured code (never a silent drop), and
 * nothing that leaves this machine carries a local filesystem path
 * (docs/14 "result contains sensitive local path", AGENTS.md P0).
 */
import { toGatewayError } from "@cg/core"
import type { ResultFile } from "@cg/core"
import type { AgentResult } from "@cg/protocol"
import type { AdapterOutput } from "@cg/sdk"

const MAX_MESSAGE_LENGTH = 300
const MAX_FILES = 16
/** Anything shaped like `/usr/x`, `C:\Users\x` or `\\host\share`. */
const PATH_PATTERN = /(?:[A-Za-z]:[\\/]|\\\\|(?:^|\s)\/)[^\s"']*/g

export function successResult(jobId: string, output: AdapterOutput, timingMs: number): AgentResult {
  const files = sanitizeFiles(output.files)
  const result: AgentResult = {
    jobId,
    status: "success",
    output: output.output,
    timingMs: round(timingMs),
  }
  if (files.length > 0) result.files = files
  return result
}

export function errorResult(jobId: string, cause: unknown, timingMs: number): AgentResult {
  const error = toGatewayError(cause)
  return {
    jobId,
    status: "error",
    error: { code: error.code, message: redactPaths(error.message) },
    timingMs: round(timingMs),
  }
}

export function redactPaths(message: string): string {
  return message.replace(PATH_PATTERN, " [path]").slice(0, MAX_MESSAGE_LENGTH)
}

/**
 * ponytail: the gateway mints `ref` handles, so an adapter that produced a real
 * file today can only describe it. Uploading the bytes to controlled storage is
 * the next step (docs/11 "Render flow"); the frame shape does not change.
 */
export function sanitizeFiles(files: readonly ResultFile[] | undefined): ResultFile[] {
  if (!Array.isArray(files)) return []
  const out: ResultFile[] = []
  for (const file of files.slice(0, MAX_FILES)) {
    if (typeof file !== "object" || file === null) continue
    const name = baseName(file.name)
    if (name === undefined) continue
    if (typeof file.mimeType !== "string" || typeof file.ref !== "string") continue
    out.push({
      name,
      mimeType: file.mimeType,
      sizeBytes: Number.isFinite(file.sizeBytes) ? Math.max(0, Math.round(file.sizeBytes)) : 0,
      ref: file.ref,
    })
  }
  return out
}

/** The protocol rejects a name containing a separator, so it is stripped here. */
function baseName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const parts = value.split(/[\\/:]/)
  const last = parts[parts.length - 1]
  if (last === undefined) return undefined
  const trimmed = last.trim()
  if (trimmed.length === 0 || trimmed === "." || trimmed === "..") return undefined
  return trimmed
}

function round(timingMs: number): number {
  return Number.isFinite(timingMs) ? Math.max(0, Math.round(timingMs)) : 0
}
