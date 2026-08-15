/**
 * Deep-merges a consumer `labels` override onto the slice defaults.
 * Only strings and plain objects are copied — a caller cannot inject a
 * function, an array, or a prototype key into the copy tree.
 */
import { isRecord } from "./guards"

/** Same shape as `T`, every leaf optional. */
export type LabelOverride<T> = {
  [K in keyof T]?: T[K] extends string ? string : T[K] extends object ? LabelOverride<T[K]> : never
}

const UNSAFE_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"])

function mergeUnknown(defaults: unknown, overrides: unknown): unknown {
  if (!isRecord(overrides)) return defaults
  const base = isRecord(defaults) ? defaults : {}
  const result: Record<string, unknown> = { ...base }

  for (const key of Object.keys(overrides)) {
    if (UNSAFE_KEYS.has(key)) continue
    const value = overrides[key]
    if (typeof value === "string") {
      result[key] = value
    } else if (isRecord(value)) {
      result[key] = mergeUnknown(result[key], value)
    }
    // Anything else is not copy: ignored, the default stands.
  }

  return result
}

export function mergeLabels<T extends object>(defaults: T, overrides?: LabelOverride<T>): T {
  if (overrides === undefined) return defaults
  return mergeUnknown(defaults, overrides) as T
}
