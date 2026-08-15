/**
 * The trust boundary on the way back. Adapter responses and agent results are
 * externally supplied values: they are guarded before anything is returned.
 */
import { ERROR_CODES, GatewayError } from "@cg/core"
import type { ErrorCode, ExecutionResult, ResultFile } from "@cg/core"
import { sanitizeFile } from "./sanitize"
import type { AdapterOutput } from "./types"

export function successResult(
  output: unknown,
  files: ResultFile[] | undefined,
  timingMs: number,
): ExecutionResult {
  const result: ExecutionResult = { status: "success", output, timingMs }
  if (files && files.length > 0) result.files = files
  return result
}

export function errorResult(code: ErrorCode, message: string, timingMs: number): ExecutionResult {
  return { status: "error", error: { code, message }, timingMs }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isResultFile(value: unknown): value is ResultFile {
  if (!isRecord(value)) return false
  if (typeof value.name !== "string" || value.name.length === 0) return false
  if (typeof value.mimeType !== "string" || value.mimeType.length === 0) return false
  if (typeof value.sizeBytes !== "number" || !Number.isFinite(value.sizeBytes) || value.sizeBytes < 0) return false
  if (typeof value.ref !== "string" || value.ref.length === 0) return false
  if (value.expiresAt !== undefined && typeof value.expiresAt !== "number") return false
  return true
}

/** Validate + scrub a `files` array from an adapter or an agent. */
export function normalizeFiles(value: unknown, malformed: GatewayError): ResultFile[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) throw malformed
  const files: ResultFile[] = []
  for (const entry of value) {
    if (!isResultFile(entry)) throw malformed
    files.push(sanitizeFile(entry))
  }
  return files
}

/** Guard an adapter's return value before it becomes an ExecutionResult. */
export function normalizeAdapterOutput(value: unknown): AdapterOutput {
  const malformed = new GatewayError("UPSTREAM_ERROR", "The connector returned a malformed response.")
  if (!isRecord(value)) throw malformed
  const files = normalizeFiles(value.files, malformed)
  const output: AdapterOutput = { output: value.output }
  if (files) output.files = files
  return output
}
