/**
 * The agent's only HTTP client: the pairing REST calls.
 *
 * A gateway response is untrusted input like any other (AGENTS.md P0), so this
 * returns a plain record and the caller validates every field it reads. Error
 * paths surface the status code only — a response body can contain anything.
 */
import { ERROR_CODES, GatewayError } from "@cg/core"
import type { ErrorCode } from "@cg/core"

export const DEFAULT_HTTP_TIMEOUT_MS = 15_000
/** A pairing response is a handful of short fields; anything larger is hostile. */
const MAX_RESPONSE_BYTES = 64 * 1024

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type PostJsonOptions = {
  fetchImpl?: FetchLike
  timeoutMs?: number
}

export async function postJson(
  url: string,
  body: unknown,
  options: PostJsonOptions = {},
): Promise<Record<string, unknown>> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (cause) {
    // The cause can carry request headers or a resolved address; it is dropped.
    if (cause instanceof Error && cause.name === "TimeoutError") {
      throw new GatewayError("TIMEOUT", "The gateway did not answer in time.")
    }
    throw new GatewayError("UPSTREAM_ERROR", "The gateway could not be reached.")
  }

  if (!response.ok) throw await errorFor(response)

  const text = await readBounded(response)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new GatewayError("UPSTREAM_ERROR", "The gateway returned a response that is not JSON.")
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new GatewayError("UPSTREAM_ERROR", "The gateway returned an unexpected response shape.")
  }
  return parsed as Record<string, unknown>
}

/**
 * The gateway answers `{error: {code, message}}`. Only the CODE is adopted, and
 * only if it is one this build knows: the caller branches on it (a pending
 * pairing is an APPROVAL_REQUIRED, not a failure). The upstream MESSAGE is
 * dropped — it is text this process did not write.
 */
async function errorFor(response: Response): Promise<GatewayError> {
  const fallback = new GatewayError(
    "UPSTREAM_ERROR",
    `The gateway rejected the request (HTTP ${response.status}).`,
  )
  let body: unknown
  try {
    body = JSON.parse(await response.text())
  } catch {
    return fallback
  }
  const error = (body as { error?: { code?: unknown } } | null)?.error
  const code = error?.code
  if (typeof code !== "string" || !(ERROR_CODES as readonly string[]).includes(code)) return fallback
  return new GatewayError(code as ErrorCode, `The gateway rejected the request (HTTP ${response.status}).`)
}

async function readBounded(response: Response): Promise<string> {
  const text = await response.text()
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new GatewayError("UPSTREAM_ERROR", "The gateway response is too large.")
  }
  return text
}
