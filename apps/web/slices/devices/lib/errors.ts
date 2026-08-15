/**
 * Maps a thrown Convex error to user copy.
 *
 * Only the error *code* is ever read. A raw `Error.message` from the server can
 * carry internal detail (AGENTS.md invariant: never surface it), so anything
 * without a recognised code renders the generic fallback.
 */
import { ConvexError } from "convex/values"
import { isRecord, readString } from "./guards"

export function extractErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ConvexError)) return undefined
  const data: unknown = error.data
  if (typeof data === "string") return readString(data)
  if (isRecord(data)) return readString(data.code)
  return undefined
}

export function resolveErrorMessage(
  error: unknown,
  messages: Record<string, string> & { fallback: string },
): string {
  const code = extractErrorCode(error)
  if (code === undefined) return messages.fallback
  return readString(messages[code]) ?? messages.fallback
}
