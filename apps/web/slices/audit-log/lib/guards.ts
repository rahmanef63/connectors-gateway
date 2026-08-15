/**
 * Primitive readers for values that arrive from the control plane.
 * Duplicated per slice on purpose: a slice never imports another slice.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function readMember<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const text = readString(value)
  if (text === undefined) return undefined
  return (allowed as readonly string[]).includes(text) ? (text as T) : undefined
}
