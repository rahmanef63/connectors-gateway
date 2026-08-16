/**
 * The gateway error model — one closed vocabulary shared by every layer.
 * Messages are safe to return to an AI client; internal detail stays in logs.
 */

export const ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_AUTHENTICATED",
  "NOT_AUTHORIZED",
  "POLICY_DENIED",
  "APPROVAL_REQUIRED",
  "CONNECTOR_NOT_FOUND",
  "ACTION_NOT_FOUND",
  "CONNECTION_MISSING",
  "DEVICE_OFFLINE",
  "DEVICE_REVOKED",
  "CAPABILITY_UNAVAILABLE",
  // The upstream said "your credential is real, it just is not allowed to do
  // this". Distinct from UPSTREAM_ERROR because the caller CAN act on it:
  // re-authorize for a wider scope. Collapsing it into a 502 tells them to
  // retry something that will never work.
  "INSUFFICIENT_SCOPE",
  "UPSTREAM_ERROR",
  "TIMEOUT",
  "CANCELLED",
  "RATE_LIMITED",
  "REPLAY_DETECTED",
  "INTERNAL",
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
  INVALID_INPUT: 400,
  NOT_AUTHENTICATED: 401,
  NOT_AUTHORIZED: 403,
  POLICY_DENIED: 403,
  APPROVAL_REQUIRED: 409,
  CONNECTOR_NOT_FOUND: 404,
  ACTION_NOT_FOUND: 404,
  CONNECTION_MISSING: 412,
  DEVICE_OFFLINE: 503,
  DEVICE_REVOKED: 403,
  CAPABILITY_UNAVAILABLE: 501,
  INSUFFICIENT_SCOPE: 403,
  UPSTREAM_ERROR: 502,
  TIMEOUT: 504,
  CANCELLED: 499,
  RATE_LIMITED: 429,
  REPLAY_DETECTED: 409,
  INTERNAL: 500,
})

export type SerializedError = {
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}

export class GatewayError extends Error {
  readonly code: ErrorCode
  readonly details: Record<string, unknown> | undefined

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = "GatewayError"
    this.code = code
    this.details = details
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code]
  }

  toJSON(): SerializedError {
    return this.details ? { code: this.code, message: this.message, details: this.details } : { code: this.code, message: this.message }
  }
}

/** Never leak an unknown throwable's stack/message shape to a caller. */
export function toGatewayError(cause: unknown): GatewayError {
  if (cause instanceof GatewayError) return cause
  if (cause instanceof Error && cause.name === "TimeoutError") {
    return new GatewayError("TIMEOUT", "The action timed out.")
  }
  return new GatewayError("INTERNAL", "The gateway failed to complete this action.")
}

export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code]
}
