/**
 * Primitive runtime guards. Every frame, envelope and key that crosses a trust
 * boundary is checked with these before any field is read (AGENTS.md P0).
 * Internal to @cg/protocol — the barrel exports the parsers, not these.
 */
import { GatewayError } from "@cg/core"

/** Ids, tokens and enum-ish fields never legitimately exceed this. */
const MAX_ID_LENGTH = 512

export function invalid(message: string): GatewayError {
  return new GatewayError("INVALID_INPUT", message)
}

export function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(`${what} must be an object.`)
  }
  return value as Record<string, unknown>
}

export function asString(value: unknown, what: string): string {
  if (typeof value !== "string") throw invalid(`${what} must be a string.`)
  return value
}

/** Non-empty, bounded, no control characters — for ids, keys and tokens. */
export function asId(value: unknown, what: string): string {
  const text = asString(value, what)
  if (text.length === 0) throw invalid(`${what} must not be empty.`)
  if (text.length > MAX_ID_LENGTH) throw invalid(`${what} is too long.`)
  // Control characters in an id are always hostile (log injection, smuggling).
  if (hasControlChar(text)) throw invalid(`${what} contains control characters.`)
  return text
}

export function asOptionalId(value: unknown, what: string): string | undefined {
  return value === undefined ? undefined : asId(value, what)
}

export function asFiniteNumber(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalid(`${what} must be a finite number.`)
  }
  return value
}

export function asOptionalFiniteNumber(value: unknown, what: string): number | undefined {
  return value === undefined ? undefined : asFiniteNumber(value, what)
}

export function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(`${what} must be an array.`)
  return value
}

export function asStringArray(value: unknown, what: string): string[] {
  return asArray(value, what).map((item, index) => asId(item, `${what}[${index}]`))
}

export function asOneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  const text = asString(value, what)
  if (!(allowed as readonly string[]).includes(text)) throw invalid(`${what} is not a supported value.`)
  return text as T
}

export function hasControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}
