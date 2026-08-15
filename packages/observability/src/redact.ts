/**
 * The single redaction chokepoint (docs/10, docs/14). Everything that leaves
 * the process as text — logs, audit records — passes through here first.
 */
import { stripPaths } from "./paths"

/** Key names whose value is never safe to emit. */
const SENSITIVE_KEY = /token|secret|credential|password|authorization|api[-_]?key|cookie|bearer/i

/** `Authorization: Bearer <x>` style values that arrive as free text. */
const BEARER_VALUE = /\b(bearer)\s+\S+/gi

export const REDACTED = "[redacted]"
const CIRCULAR = "[circular]"
const TRUNCATED = "[truncated]"
const MAX_DEPTH = 8

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key)
}

export function redactText(value: string): string {
  return stripPaths(value.replace(BEARER_VALUE, `$1 ${REDACTED}`))
}

/**
 * Deep clone with secrets removed, absolute paths reduced to basenames,
 * cycles broken, and depth bounded. Never mutates the input.
 */
export function redact(value: unknown): unknown {
  return walk(value, 0, new Set<object>())
}

function walk(value: unknown, depth: number, seen: Set<object>): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "string") return redactText(value)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return redactError(value)

  if (depth >= MAX_DEPTH) return TRUNCATED
  const object = value as object
  if (seen.has(object)) return CIRCULAR
  seen.add(object)
  try {
    if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1, seen))
    if (value instanceof Set) return Array.from(value, (item) => walk(item, depth + 1, seen))
    if (value instanceof Map) return redactEntries(Array.from(value), depth, seen)
    return redactEntries(Object.entries(value as Record<string, unknown>), depth, seen)
  } finally {
    // Released on exit so a value referenced twice by siblings is not a cycle.
    seen.delete(object)
  }
}

function redactEntries(
  entries: Array<[unknown, unknown]>,
  depth: number,
  seen: Set<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [rawKey, rawValue] of entries) {
    const key = typeof rawKey === "string" ? rawKey : String(rawKey)
    out[key] = isSensitiveKey(key) ? REDACTED : walk(rawValue, depth + 1, seen)
  }
  return out
}

function redactError(error: Error): Record<string, unknown> {
  // Stacks carry absolute source paths, so they are never emitted.
  return { name: error.name, message: redactText(error.message) }
}
