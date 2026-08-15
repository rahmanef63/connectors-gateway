/**
 * Structured logging. One JSON object per line, on stderr, always redacted.
 * stdout stays free for protocol traffic (an MCP stdio transport lives there).
 */
import { redact, redactText } from "./redact"

export type LogLevel = "info" | "warn" | "error"

export type LogFields = {
  requestId?: string
  [key: string]: unknown
}

export type Logger = {
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** Derive a logger that carries extra fields — e.g. a requestId. */
  child(fields: LogFields): Logger
}

export type LoggerOptions = {
  /** Sink seam. Defaults to stderr; tests inject a collector. */
  write?: (line: string) => void
  /** Fields merged into every record. */
  base?: LogFields
  now?: () => number
}

function writeStderr(line: string): void {
  process.stderr.write(line + "\n")
}

export function createLogger(scope: string, options: LoggerOptions = {}): Logger {
  const write = options.write ?? writeStderr
  const now = options.now ?? Date.now
  const base = options.base ?? {}

  const emit = (level: LogLevel, message: string, fields?: LogFields): void => {
    const merged = { ...base, ...fields }
    const record: Record<string, unknown> = {
      time: new Date(now()).toISOString(),
      level,
      scope: redactText(scope),
      message: redactText(message),
      ...(redact(merged) as Record<string, unknown>),
    }
    write(serialize(record))
  }

  return {
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (fields) => createLogger(scope, { ...options, base: { ...base, ...fields } }),
  }
}

/** A logger must never throw into the caller's happy path. */
function serialize(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record)
  } catch {
    return JSON.stringify({ time: record.time, level: record.level, scope: record.scope, message: "[unserializable]" })
  }
}
