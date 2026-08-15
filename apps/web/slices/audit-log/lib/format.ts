/**
 * Audit rendering primitives: the column allowlist, the redaction guard, and
 * the two formatters.
 *
 * The guard is the point of the file. An audit row arrives as an opaque record
 * and may grow fields upstream (payloads, headers, credentials). Nothing is
 * spread and nothing is rendered unless its name is on `AUDIT_COLUMNS` —
 * docs/10 forbids the audit view from becoming a payload viewer.
 */
import { ERROR_CODES, EXECUTOR_KINDS, POLICY_DECISIONS } from "@cg/core"
import type { AuditColumn, AuditRowView, AuditStatus } from "../types"
import { isRecord, readMember, readNumber, readString } from "./guards"

export const AUDIT_COLUMNS: readonly AuditColumn[] = Object.freeze([
  "timestamp",
  "connectorId",
  "actionId",
  "executorKind",
  "policyDecision",
  "status",
  "latencyMs",
  "errorCode",
  "deviceId",
  "connectionId",
  "actorId",
  "userId",
  "workspaceId",
  "requestId",
])

export const DEFAULT_AUDIT_COLUMNS: readonly AuditColumn[] = Object.freeze([
  "timestamp",
  "connectorId",
  "actionId",
  "executorKind",
  "policyDecision",
  "status",
  "latencyMs",
])

export const AUDIT_STATUSES: readonly AuditStatus[] = Object.freeze(["success", "error"])

export function isAuditColumn(value: unknown): value is AuditColumn {
  return typeof value === "string" && (AUDIT_COLUMNS as readonly string[]).includes(value)
}

/** Drops anything not on the allowlist; empty selections fall back to the default set. */
export function selectAuditColumns(requested: unknown): AuditColumn[] {
  if (!Array.isArray(requested)) return [...DEFAULT_AUDIT_COLUMNS]
  const selected: AuditColumn[] = []
  for (const entry of requested) {
    if (isAuditColumn(entry) && !selected.includes(entry)) selected.push(entry)
  }
  return selected.length > 0 ? selected : [...DEFAULT_AUDIT_COLUMNS]
}

/** Copies allowlisted fields only. Returns null when the row is not an audit event. */
export function redactAuditRecord(record: unknown): AuditRowView | null {
  if (!isRecord(record)) return null

  const requestId = readString(record.requestId)
  const timestamp = readNumber(record.timestamp)
  const actorId = readString(record.actorId)
  const userId = readString(record.userId)
  const connectorId = readString(record.connectorId)
  const actionId = readString(record.actionId)
  const executorKind = readMember(record.executorKind, EXECUTOR_KINDS)
  const policyDecision = readMember(record.policyDecision, POLICY_DECISIONS)
  const status = readMember(record.status, AUDIT_STATUSES)
  const latencyMs = readNumber(record.latencyMs)

  if (
    requestId === undefined ||
    timestamp === undefined ||
    actorId === undefined ||
    userId === undefined ||
    connectorId === undefined ||
    actionId === undefined ||
    executorKind === undefined ||
    policyDecision === undefined ||
    status === undefined ||
    latencyMs === undefined
  ) {
    return null
  }

  return {
    // A list key, not a column: `rowId` never reaches a cell (see types.ts).
    rowId: readString(record.rowId) ?? `${requestId}:${timestamp}`,
    requestId,
    timestamp,
    actorId,
    userId,
    workspaceId: readString(record.workspaceId),
    connectorId,
    actionId,
    executorKind,
    deviceId: readString(record.deviceId),
    connectionId: readString(record.connectionId),
    policyDecision,
    status,
    latencyMs,
    errorCode: readMember(record.errorCode, ERROR_CODES),
  }
}

export function redactAuditRecords(records: unknown): AuditRowView[] {
  if (!Array.isArray(records)) return []
  const rows: AuditRowView[] = []
  for (const record of records) {
    const row = redactAuditRecord(record)
    if (row !== null) rows.push(row)
  }
  return rows
}

export type LatencyUnits = { milliseconds: string; seconds: string }

export function formatLatency(value: unknown, units: LatencyUnits, fallback: string): string {
  const ms = readNumber(value)
  if (ms === undefined || ms < 0) return fallback
  if (ms < 1000) return `${Math.round(ms)} ${units.milliseconds}`
  return `${(ms / 1000).toFixed(2)} ${units.seconds}`
}

export type TimestampFormatOptions = {
  locale?: string | undefined
  timeZone?: string | undefined
}

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
}

export function formatTimestamp(
  value: unknown,
  fallback: string,
  options: TimestampFormatOptions = {},
): string {
  const ms = readNumber(value)
  if (ms === undefined || ms <= 0) return fallback
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return fallback
  const formatOptions: Intl.DateTimeFormatOptions =
    options.timeZone === undefined ? DATE_TIME_FORMAT : { ...DATE_TIME_FORMAT, timeZone: options.timeZone }
  return new Intl.DateTimeFormat(options.locale, formatOptions).format(date)
}
