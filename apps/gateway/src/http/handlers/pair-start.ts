/**
 * POST /v1/pair/start — an agent asks for a pairing code (docs/04).
 *
 * NO caller authentication: the agent has no credential yet. That is exactly
 * why it is rate limited hard, why the code is short-lived, and why the
 * response contains nothing an attacker could use without a human approving in
 * the dashboard.
 */
import { DEVICE_PLATFORMS, GatewayError } from "@cg/core"
import type { DevicePlatform } from "@cg/core"
import { PAIRING_TTL_MS } from "../../store/pairing"
import { readJsonBody } from "../body"
import { errorResponseFor, jsonResponse } from "../respond"
import type { RouteContext } from "../routes"

const MAX_DEVICE_NAME = 64
/** Printable, no control characters — the name is shown in the dashboard. */
const DEVICE_NAME_RE = /^[\w .()-]{1,64}$/

function parseDeviceName(value: unknown): string {
  if (typeof value !== "string" || !DEVICE_NAME_RE.test(value.trim())) {
    throw new GatewayError(
      "INVALID_INPUT",
      `deviceName must be 1-${MAX_DEVICE_NAME} characters of letters, digits, spaces, . ( ) - _`,
    )
  }
  return value.trim()
}

function parsePlatform(value: unknown): DevicePlatform {
  if (typeof value !== "string" || !(DEVICE_PLATFORMS as readonly string[]).includes(value)) {
    throw new GatewayError("INVALID_INPUT", "platform must be windows, macos or linux.")
  }
  return value as DevicePlatform
}

export async function handlePairStart(context: RouteContext): Promise<Response> {
  try {
    if (!context.deps.pairingLimiter.check(`start:${context.clientKey}`)) {
      throw new GatewayError("RATE_LIMITED", "Too many pairing attempts. Try again shortly.")
    }
    const body = await readJsonBody(context.request)
    const challenge = await context.deps.pairing.createChallenge({
      deviceName: parseDeviceName(body.deviceName),
      platform: parsePlatform(body.platform),
      ttlMs: PAIRING_TTL_MS,
    })

    context.deps.logger.info("pairing started", { challengeId: challenge.id })
    return jsonResponse({
      challengeId: challenge.id,
      code: challenge.code,
      verificationUrl: `${context.deps.config.webPublicUrl}/pair?code=${encodeURIComponent(challenge.code)}`,
      expiresAt: challenge.expiresAt,
    })
  } catch (cause) {
    return errorResponseFor(cause)
  }
}
