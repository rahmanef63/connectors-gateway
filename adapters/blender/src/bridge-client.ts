/**
 * JSON-over-HTTP client for the Blender add-on bridge.
 *
 * P0 / AGENTS.md invariant 3: the bridge is loopback-only. `assertLoopback` runs in the
 * constructor AND again before every single request, so a mutated or re-read configuration
 * value can never turn this adapter into an outbound client for an attacker-chosen host.
 */
import { GatewayError } from "@cg/core"

/** WHATWG `URL` reports an IPv6 host with brackets, so both spellings are listed. */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "[::1]", "localhost"])

export const DEFAULT_BRIDGE_TIMEOUT_MS = 30_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 600_000
/** A rogue/huge bridge response must not be able to exhaust agent memory. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

export function assertLoopback(url: string): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw loopbackError()
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw loopbackError()
  // `http://127.0.0.1@evil.com` parses with hostname "evil.com"; userinfo is never legitimate here.
  if (parsed.username !== "" || parsed.password !== "") throw loopbackError()
  if (!LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())) throw loopbackError()
  return parsed
}

function loopbackError(): GatewayError {
  return new GatewayError("NOT_AUTHORIZED", "Blender bridge must be loopback.")
}

export class BridgeClient {
  readonly #baseUrl: string
  readonly #timeoutMs: number

  constructor(baseUrl: string, timeoutMs: number = DEFAULT_BRIDGE_TIMEOUT_MS) {
    assertLoopback(baseUrl)
    this.#baseUrl = baseUrl
    this.#timeoutMs = Math.min(Math.max(Math.trunc(timeoutMs) || DEFAULT_BRIDGE_TIMEOUT_MS, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
  }

  get baseUrl(): string {
    return this.#baseUrl
  }

  get timeoutMs(): number {
    return this.#timeoutMs
  }

  async get(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.#send("GET", path, undefined, signal)
  }

  async post(path: string, body: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.#send("POST", path, body, signal)
  }

  async #send(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const base = assertLoopback(this.#baseUrl)
    const target = new URL(path, base)
    // A relative path must not be able to escape to another origin (`//host/x`).
    if (target.origin !== base.origin) throw loopbackError()

    let response: Response
    try {
      response = await fetch(target, {
        method,
        headers:
          method === "POST"
            ? { "Content-Type": "application/json", Accept: "application/json" }
            : { Accept: "application/json" },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        signal: mergeSignals(this.#timeoutMs, signal),
        // The loopback invariant is worth nothing if the hop after it is free.
        // Default `follow` would let anything listening on 127.0.0.1 — a rogue
        // add-on, another local app that grabbed the port — answer `302
        // Location: https://evil.test` and have fetch replay this request body
        // off-box, which is precisely the outbound call `assertLoopback` exists
        // to prevent. `manual` over `error` so the hop surfaces as a redirect
        // instead of a TypeError indistinguishable from the bridge being down.
        redirect: "manual",
      })
    } catch (cause) {
      throw transportError(cause)
    }

    // A runtime that returns an opaque redirect reports status 0, not a 3xx.
    if ((response.status >= 300 && response.status < 400) || response.type === "opaqueredirect") {
      // The Location value is not echoed: it is text this process did not write.
      throw new GatewayError("UPSTREAM_ERROR", "The Blender bridge attempted a redirect.")
    }

    if (!response.ok) {
      // Only the status is surfaced: a bridge error body can contain local paths.
      throw new GatewayError("UPSTREAM_ERROR", `The Blender bridge refused the call (HTTP ${response.status}).`)
    }
    return parseJsonObject(await response.text())
  }
}

function mergeSignals(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/** Every byte from the bridge is untrusted input and is shape-checked before use. */
function parseJsonObject(raw: string): Record<string, unknown> {
  if (raw.length > MAX_RESPONSE_BYTES) {
    throw new GatewayError("UPSTREAM_ERROR", "The Blender bridge returned an oversized response.")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new GatewayError("UPSTREAM_ERROR", "The Blender bridge returned a malformed response.")
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GatewayError("UPSTREAM_ERROR", "The Blender bridge returned an unexpected response.")
  }
  return parsed as Record<string, unknown>
}

function transportError(cause: unknown): GatewayError {
  const name = cause instanceof Error ? cause.name : ""
  if (name === "TimeoutError") return new GatewayError("TIMEOUT", "The Blender bridge did not respond in time.")
  if (name === "AbortError") return new GatewayError("CANCELLED", "The Blender call was cancelled.")
  // The raw network error is dropped: it can echo the local URL and system detail.
  return new GatewayError("CAPABILITY_UNAVAILABLE", "The Blender bridge is not reachable.")
}
