/**
 * Device pairing (docs/04).
 *
 *   POST /v1/pair/start  { deviceName, platform }
 *        -> { challengeId, code, verificationUrl, expiresAt }
 *   human approves the CODE in a browser, signed in as themselves
 *   POST /v1/pair/claim  { challengeId, code }
 *        -> { status: "pending" | "expired" }
 *         | { status: "approved", deviceId, credential, signingPublicKey, keyId }
 *
 * The code is printed for the human. The credential never is: it goes straight
 * into the credential store (AGENTS.md invariant 4 and P0).
 */
import { setTimeout as nodeSleep } from "node:timers/promises"
import type { DevicePlatform } from "@cg/core"
import { GatewayError } from "@cg/core"
import { backoffDelay } from "./backoff"
import type { AgentConfig } from "./config"
import { parseConfig, saveConfig } from "./config"
import { httpBaseFrom } from "./env"
import { postJson } from "./http"
import type { FetchLike } from "./http"
import { claimResponse, startResponse } from "./pairing-parse"

export const PAIR_START_PATH = "/v1/pair/start"
export const PAIR_CLAIM_PATH = "/v1/pair/claim"
export const POLL_BASE_MS = 2_000
export const POLL_MAX_MS = 10_000
/** Hard stop even if the gateway hands out a very long TTL. */
export const MAX_PAIRING_WAIT_MS = 15 * 60 * 1000

export type PairingOptions = {
  gatewayUrl: string
  configDir: string
  deviceName: string
  platform: DevicePlatform
  fetchImpl?: FetchLike
  print?: (line: string) => void
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  random?: () => number
}

export async function runPairing(options: PairingOptions): Promise<AgentConfig> {
  const base = httpBaseFrom(options.gatewayUrl)
  const print = options.print ?? ((line: string) => console.log(line))
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms: number) => nodeSleep(ms))

  const started = startResponse(
    await postJson(`${base}${PAIR_START_PATH}`, {
      deviceName: options.deviceName,
      platform: options.platform,
    }, fetchOptions(options)),
  )

  print("")
  print(`  Pairing code:      ${started.code}`)
  print(`  Approve it here:   ${started.verificationUrl}`)
  print("")
  print("  Waiting for approval. The code expires shortly.")

  const deadline = Math.min(started.expiresAt, now() + MAX_PAIRING_WAIT_MS)
  let attempt = 0
  let lastError: GatewayError | undefined

  while (now() < deadline) {
    attempt += 1
    await sleep(pollDelay(attempt, options.random))
    let claimed: ReturnType<typeof claimResponse>
    try {
      claimed = claimResponse(
        await postJson(`${base}${PAIR_CLAIM_PATH}`, {
          challengeId: started.challengeId,
          code: started.code,
        }, fetchOptions(options)),
      )
    } catch (cause) {
      // A blip while a human walks to their browser must not end the pairing.
      lastError = asRetryable(cause)
      continue
    }
    if (claimed.status === "expired") {
      throw new GatewayError("NOT_AUTHORIZED", "The pairing code expired before it was approved.")
    }
    if (claimed.status === "approved") {
      const config = parseConfig({ ...claimed.credentialSet, gatewayUrl: options.gatewayUrl, disabledActions: [] })
      saveConfig(options.configDir, config)
      print(`  Paired. Device id: ${config.deviceId}`)
      return config
    }
  }

  // A transport failure is worth surfacing verbatim (a wrong CG_GATEWAY_URL
  // looks exactly like "nobody approved" otherwise); an APPROVAL_REQUIRED does not.
  const transport = lastError?.code === "UPSTREAM_ERROR" || lastError?.code === "TIMEOUT"
  if (transport && lastError !== undefined) throw lastError
  throw new GatewayError("TIMEOUT", "The pairing code was not approved in time.")
}

/** Polling reuses the reconnect curve, just with a slower, tighter band. */
export function pollDelay(attempt: number, random?: () => number): number {
  const options = { baseMs: POLL_BASE_MS, maxMs: POLL_MAX_MS }
  return random === undefined ? backoffDelay(attempt, options) : backoffDelay(attempt, { ...options, random })
}

function fetchOptions(options: PairingOptions): { fetchImpl?: FetchLike } {
  return options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
}

/**
 * Retryable while a human walks to their browser: a transport blip, a rate
 * limit, and APPROVAL_REQUIRED — which is how the reference gateway says
 * "not approved yet, already claimed, or expired" without letting a caller
 * probe which challenge ids exist. Anything else is a contract failure.
 */
const RETRYABLE_CODES: readonly string[] = ["UPSTREAM_ERROR", "TIMEOUT", "APPROVAL_REQUIRED", "RATE_LIMITED"]

function asRetryable(cause: unknown): GatewayError {
  if (cause instanceof GatewayError && RETRYABLE_CODES.includes(cause.code)) return cause
  throw cause
}
