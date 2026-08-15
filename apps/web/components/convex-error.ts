/**
 * Thrown error → user copy. The one place the app turns a failed mutation into
 * a sentence.
 *
 * Only the error *code* is ever read. A server `message` can name a Convex
 * function path, a row id or a credential (AGENTS.md P0: never surface internal
 * detail), so anything without a recognised code renders the caller's fallback.
 *
 * The slices carry their own copy of this — a slice must install without the
 * host. This is the host's copy, for the surfaces that are not slices.
 */
import { ConvexError } from "convex/values"

/** A code → copy table. `fallback` is mandatory: every failure says something. */
export type ErrorCopy = Readonly<Record<string, string>> & { readonly fallback: string }

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/**
 * `undefined` for anything that is not a ConvexError carrying a code — a plain
 * `Error` from the transport, a thrown string, a payload with a numeric code.
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ConvexError)) return undefined
  const data: unknown = error.data
  if (typeof data === "string") return readString(data)
  if (isPlainRecord(data)) return readString(data.code)
  return undefined
}

/**
 * `Object.hasOwn` and not a bare index: `copy["toString"]` would resolve an
 * inherited member and print a function body at the user.
 */
export function resolveErrorMessage(error: unknown, copy: ErrorCopy): string {
  const code = extractErrorCode(error)
  if (code === undefined || !Object.hasOwn(copy, code)) return copy.fallback
  return readString(copy[code]) ?? copy.fallback
}
