/**
 * Deterministic JSON — the signing preimage for job envelopes (docs/14: replayed job).
 *
 * SECURITY: this function must be injective. Two values that differ in any way a
 * verifier would care about must never produce the same string, or a signature
 * could be lifted from one payload onto another. Everything ambiguous is rejected
 * rather than coerced: `undefined` inside arrays (would collide with `null`),
 * non-finite numbers, class instances / Date / Map (would collide with `{}`).
 */
import { GatewayError } from "@cg/core"

/** Bounds recursion so hostile input throws INVALID_INPUT instead of a RangeError. */
const MAX_DEPTH = 64

export function canonicalJson(value: unknown): string {
  return write(value, new Set<object>(), 0)
}

function write(value: unknown, ancestors: Set<object>, depth: number): string {
  if (depth > MAX_DEPTH) throw invalid("Value is nested too deeply.")
  if (value === null) return "null"

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false"
    case "number":
      return writeNumber(value)
    case "string":
      // JSON.stringify escaping is spec-defined and injective (lone surrogates included).
      return JSON.stringify(value)
    case "object":
      break
    default:
      throw invalid(`A value of type ${typeof value} cannot be serialized.`)
  }

  const container = value as object
  if (ancestors.has(container)) throw invalid("Value contains a cycle.")
  ancestors.add(container)
  try {
    if (Array.isArray(container)) return writeArray(container, ancestors, depth)
    if (!isPlainObject(container)) throw invalid("Only plain objects and arrays can be serialized.")
    return writeObject(container as Record<string, unknown>, ancestors, depth)
  } finally {
    ancestors.delete(container)
  }
}

function writeArray(value: unknown[], ancestors: Set<object>, depth: number): string {
  const parts: string[] = []
  for (const item of value) {
    // `[undefined]` would otherwise serialize as `[null]` and collide with a real null.
    if (item === undefined) throw invalid("Array elements cannot be undefined.")
    parts.push(write(item, ancestors, depth + 1))
  }
  return `[${parts.join(",")}]`
}

function writeObject(value: Record<string, unknown>, ancestors: Set<object>, depth: number): string {
  const parts: string[] = []
  // Default sort compares UTF-16 code units — deterministic across engines.
  for (const key of Object.keys(value).sort()) {
    const item = value[key]
    if (item === undefined) continue
    parts.push(`${JSON.stringify(key)}:${write(item, ancestors, depth + 1)}`)
  }
  return `{${parts.join(",")}}`
}

function writeNumber(value: number): string {
  if (!Number.isFinite(value)) throw invalid("Numbers must be finite.")
  // -0 and 0 are the same JSON number; normalize so the preimage is stable.
  return Object.is(value, -0) ? "0" : String(value)
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function invalid(message: string): GatewayError {
  return new GatewayError("INVALID_INPUT", message)
}
