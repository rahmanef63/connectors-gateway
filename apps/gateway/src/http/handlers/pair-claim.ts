/**
 * POST /v1/pair/claim — the agent exchanges an APPROVED challenge for its
 * device credential, exactly once (docs/04).
 *
 * The gateway mints and hashes the credential; Convex only ever sees the hash.
 * The plaintext is in this response and nowhere else — not in a log, not in the
 * control plane, never in an AI-facing payload (AGENTS.md invariant 4).
 */
import { GatewayError } from "@cg/core"
import { readJsonBody } from "../body"
import { errorResponseFor, jsonResponse } from "../respond"
import type { RouteContext } from "../routes"

const CHALLENGE_ID_RE = /^[A-Za-z0-9_-]{8,128}$/

export async function handlePairClaim(context: RouteContext): Promise<Response> {
  try {
    if (!context.deps.claimLimiter.check(`claim:${context.clientKey}`)) {
      throw new GatewayError("RATE_LIMITED", "Too many claim attempts. Try again shortly.")
    }
    const body = await readJsonBody(context.request)
    const challengeId = body.challengeId
    if (typeof challengeId !== "string" || !CHALLENGE_ID_RE.test(challengeId)) {
      throw new GatewayError("INVALID_INPUT", "challengeId is missing or malformed.")
    }

    const registration = await context.deps.pairing.claim(challengeId)
    if (!registration) {
      // One message for not-yet-approved, already-claimed and expired: the
      // caller must not be able to probe which challenge ids exist.
      throw new GatewayError(
        "APPROVAL_REQUIRED",
        "This pairing request is not approved, or it has already been used.",
      )
    }

    context.deps.logger.info("device paired", { deviceId: registration.device.id })
    return jsonResponse({
      deviceId: registration.device.id,
      credential: registration.credential,
      device: {
        id: registration.device.id,
        displayName: registration.device.displayName,
        platform: registration.device.platform,
        status: registration.device.status,
      },
    })
  } catch (cause) {
    return errorResponseFor(cause)
  }
}
