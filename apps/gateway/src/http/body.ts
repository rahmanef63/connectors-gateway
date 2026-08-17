/**
 * Request-body reading. A body is untrusted input: the content type is
 * enforced, the size is capped before parsing, and a parse failure never echoes
 * the body back (it may carry a credential the model was handed).
 */
import { GatewayError } from "@cg/core"

export const MAX_BODY_BYTES = 1024 * 1024

function invalid(message: string): GatewayError {
  return new GatewayError("INVALID_INPUT", message)
}

function assertJsonContentType(request: Request): void {
  const header = request.headers.get("content-type") ?? ""
  const type = header.split(";")[0]?.trim().toLowerCase() ?? ""
  if (type !== "application/json") {
    throw invalid("This endpoint accepts application/json only.")
  }
}

/**
 * `application/x-www-form-urlencoded`, for the OAuth token endpoint.
 *
 * RFC 6749 §4.1.3 mandates this encoding, not JSON — a client library will send
 * a form and nothing else, so the token endpoint cannot reuse `readJsonBody`.
 * A repeated parameter takes the FIRST value: `URLSearchParams.get` is
 * last-wins, which would let `code=stolen&code=mine` present one value to a log
 * and another to the verifier.
 */
export async function readFormBody(request: Request): Promise<Record<string, string>> {
  const header = request.headers.get("content-type") ?? ""
  const type = header.split(";")[0]?.trim().toLowerCase() ?? ""
  if (type !== "application/x-www-form-urlencoded") {
    throw invalid("This endpoint accepts application/x-www-form-urlencoded only.")
  }

  const declared = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw invalid("The request body is too large.")
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) throw invalid("The request body is too large.")

  const fields: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(raw)) {
    if (!Object.hasOwn(fields, key)) fields[key] = value
  }
  return fields
}

/**
 * Returns `{}` for an empty body so a caller may omit it for a no-argument
 * action; anything else must be a JSON object (never a bare array or scalar).
 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  assertJsonContentType(request)

  const declared = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw invalid("The request body is too large.")
  }

  const raw = await request.text()
  // `text()` already decoded; the byte cap is re-checked because
  // content-length is caller-supplied and may be absent or wrong.
  if (raw.length > MAX_BODY_BYTES) throw invalid("The request body is too large.")
  if (raw.trim().length === 0) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw invalid("The request body is not valid JSON.")
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw invalid("The request body must be a JSON object.")
  }
  return parsed as Record<string, unknown>
}
