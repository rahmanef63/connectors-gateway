/**
 * Field-level guards for agent → gateway frames.
 * Nothing here echoes a credential or a filesystem path back into an error.
 */
import { ERROR_CODES, type CapabilityReport, type ResultFile } from "@cg/core"
import {
  asArray,
  asFiniteNumber,
  asId,
  asOneOf,
  asOptionalFiniteNumber,
  asOptionalId,
  asRecord,
  asString,
  asStringArray,
  hasControlChar,
  invalid,
} from "./guards"
import type { AgentResult } from "./types"

const CAPABILITY_STATUSES = ["available", "unavailable"] as const
const RESULT_STATUSES = ["success", "error"] as const
const MAX_CAPABILITY_REPORTS = 64
const MAX_RESULT_FILES = 64
const MAX_FILE_NAME_LENGTH = 255

export function parseCapabilityReports(value: unknown, what: string): CapabilityReport[] {
  const items = asArray(value, what)
  if (items.length > MAX_CAPABILITY_REPORTS) throw invalid(`${what} has too many entries.`)
  items.forEach((item, index) => {
    const report = asRecord(item, `${what}[${index}]`)
    asId(report.connector, `${what}[${index}].connector`)
    asOneOf(report.status, CAPABILITY_STATUSES, `${what}[${index}].status`)
    asOptionalId(report.version, `${what}[${index}].version`)
    asId(report.adapterVersion, `${what}[${index}].adapterVersion`)
    asStringArray(report.capabilities, `${what}[${index}].capabilities`)
  })
  return value as CapabilityReport[]
}

export function parseAgentResult(value: unknown, what: string): AgentResult {
  const record = asRecord(value, what)
  asId(record.jobId, `${what}.jobId`)
  asOneOf(record.status, RESULT_STATUSES, `${what}.status`)
  const timingMs = asFiniteNumber(record.timingMs, `${what}.timingMs`)
  if (timingMs < 0) throw invalid(`${what}.timingMs must not be negative.`)
  if (record.files !== undefined) parseResultFiles(record.files, `${what}.files`)
  if (record.error !== undefined && record.error !== null) parseResultError(record.error, `${what}.error`)
  return value as AgentResult
}

function parseResultFiles(value: unknown, what: string): ResultFile[] {
  const items = asArray(value, what)
  if (items.length > MAX_RESULT_FILES) throw invalid(`${what} has too many entries.`)
  items.forEach((item, index) => {
    const file = asRecord(item, `${what}[${index}]`)
    assertSafeFileName(file.name, `${what}[${index}].name`)
    asId(file.mimeType, `${what}[${index}].mimeType`)
    asId(file.ref, `${what}[${index}].ref`)
    const size = asFiniteNumber(file.sizeBytes, `${what}[${index}].sizeBytes`)
    if (size < 0) throw invalid(`${what}[${index}].sizeBytes must not be negative.`)
    asOptionalFiniteNumber(file.expiresAt, `${what}[${index}].expiresAt`)
  })
  return value as ResultFile[]
}

function parseResultError(value: unknown, what: string): void {
  const error = asRecord(value, what)
  asOneOf(error.code, ERROR_CODES, `${what}.code`)
  asString(error.message, `${what}.message`)
}

/**
 * docs/14: "result contains sensitive local path". A result file carries a bare
 * name; anything that looks like a path is rejected at the trust boundary rather
 * than silently rewritten.
 */
function assertSafeFileName(value: unknown, what: string): void {
  const name = asString(value, what)
  if (name.length === 0 || name.length > MAX_FILE_NAME_LENGTH) throw invalid(`${what} has an unusable length.`)
  if (hasControlChar(name)) throw invalid(`${what} contains control characters.`)
  if (name === "." || name === "..") throw invalid(`${what} is not a file name.`)
  if (name.includes("/") || name.includes("\\") || name.includes(":")) {
    throw invalid(`${what} must be a file name, not a path.`)
  }
}
