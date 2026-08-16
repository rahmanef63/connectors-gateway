/**
 * Control-plane error model.
 *
 * Convex functions must throw `ConvexError` for the payload to survive the
 * wire, so `GatewayError` cannot be thrown here. The code vocabulary is still
 * `@cg/core`'s `ERROR_CODES`, so a gateway `catch` maps one-to-one onto
 * `GatewayError` without a translation table.
 */
import { ConvexError } from "convex/values"
import { ERROR_CODES, type ErrorCode } from "@cg/core"

export type ControlPlaneErrorData = {
  code: ErrorCode
  message: string
}

export function isControlPlaneErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value)
}

/**
 * The only throw site in this app. Messages are client-safe: they never carry
 * a token, a hash, a row id, or caller-supplied text.
 */
export function fail(code: ErrorCode, message: string): never {
  const data: ControlPlaneErrorData = { code, message }
  throw new ConvexError(data)
}

/** Reads the code back off a caught error — used by tests and the gateway. */
export function errorCodeOf(cause: unknown): ErrorCode | null {
  if (!(cause instanceof ConvexError)) return null
  const data: unknown = cause.data
  if (typeof data !== "object" || data === null) return null
  const code: unknown = (data as { code?: unknown }).code
  return isControlPlaneErrorCode(code) ? code : null
}
