/**
 * Guards for the two pairing responses. Split from pairing.ts because parsing an
 * untrusted response is its own responsibility — and the only place a credential
 * is read out of the network.
 */
import { GatewayError } from "@cg/core"

const MAX_TEXT_LENGTH = 512
const MAX_URL_LENGTH = 2048
const CLAIM_STATUSES = ["pending", "approved", "expired"] as const

export type PairingStart = {
  challengeId: string
  code: string
  verificationUrl: string
  /** epoch ms */
  expiresAt: number
}

export type ApprovedCredentials = {
  deviceId: string
  credential: string
  /**
   * Optional: the reference gateway hands the job-signing key to the agent in
   * the `welcome` frame instead (apps/gateway relay). When a gateway does
   * return it here, it is pinned immediately — one fewer trust-on-first-use.
   */
  signingPublicKey?: string
  keyId?: string
}

export type PairingClaim =
  | { status: "pending" | "expired" }
  | { status: "approved"; credentialSet: ApprovedCredentials }

export function startResponse(body: Record<string, unknown>): PairingStart {
  return {
    challengeId: text(body["challengeId"], "challengeId"),
    code: text(body["code"], "code"),
    verificationUrl: url(body["verificationUrl"]),
    expiresAt: timestamp(body["expiresAt"]),
  }
}

/**
 * Approval is signalled by the presence of a credential, not by a status field:
 * the reference gateway answers a successful claim with `{deviceId, credential}`
 * and reports "not approved yet" as an APPROVAL_REQUIRED status code instead.
 * An explicit `status` is still honoured for a gateway that sends one.
 */
export function claimResponse(body: Record<string, unknown>): PairingClaim {
  const status = body["status"] === undefined ? undefined : text(body["status"], "status")
  if (status !== undefined && !(CLAIM_STATUSES as readonly string[]).includes(status)) {
    throw invalid("the pairing status is not a known value")
  }
  if (status === "pending" || status === "expired") return { status }
  if (status === undefined && body["credential"] === undefined) {
    throw invalid("the claim response carries neither a status nor a credential")
  }

  const credentialSet: ApprovedCredentials = {
    deviceId: text(body["deviceId"], "deviceId"),
    // Read, never printed and never logged (AGENTS.md P0).
    credential: text(body["credential"], "credential"),
  }
  const signingPublicKey = body["signingPublicKey"]
  const keyId = body["keyId"]
  if (signingPublicKey !== undefined || keyId !== undefined) {
    credentialSet.signingPublicKey = text(signingPublicKey, "signingPublicKey")
    credentialSet.keyId = text(keyId, "keyId")
  }
  return { status: "approved", credentialSet }
}

/**
 * The verification URL is printed into the user's terminal and may be clicked,
 * so the scheme is pinned: `javascript:` or `file:` must never be offered.
 */
function url(value: unknown): string {
  const raw = text(value, "verificationUrl")
  if (raw.length > MAX_URL_LENGTH) throw invalid("the verification URL is too long")
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw invalid("the verification URL is not a URL")
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw invalid("the verification URL must be http(s)")
  }
  return parsed.toString()
}

function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw invalid("the expiry timestamp is not valid")
  }
  return value
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw invalid(`${field} must be a string`)
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_TEXT_LENGTH) {
    throw invalid(`${field} has an unusable length`)
  }
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i)
    // Control characters in a value that gets printed to a terminal are hostile.
    if (code < 0x20 || code === 0x7f) throw invalid(`${field} contains control characters`)
  }
  return trimmed
}

/** Never echoes the offending value: one of these fields is the credential. */
function invalid(problem: string): GatewayError {
  return new GatewayError("UPSTREAM_ERROR", `The pairing response is invalid: ${problem}.`)
}
