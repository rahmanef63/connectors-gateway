/**
 * Frame parsing. A WebSocket frame is untrusted input in both directions, so
 * nothing is read off it before the whole shape has been validated (AGENTS.md P0).
 */
import { DEVICE_PLATFORMS, ERROR_CODES } from "@cg/core"
import { parseAgentResult, parseCapabilityReports } from "./agent-frames"
import { asId, asOneOf, asRecord, asString, invalid } from "./guards"
import { parseSignedJob } from "./job-guards"
import { verifyKeyRotationShape } from "./rotation-guard"
import type { AgentMessage, GatewayMessage } from "./types"

/**
 * Hard cap applied before `JSON.parse`.
 * ponytail: measured in UTF-16 code units, not bytes — cheap and allocation-free.
 * A multi-byte frame can therefore reach ~3 MiB; the transport's own frame limit
 * is the byte-accurate control.
 */
export const MAX_FRAME_BYTES = 1024 * 1024

const AGENT_MESSAGE_TYPES = ["hello", "heartbeat", "capabilities", "result"] as const
const GATEWAY_MESSAGE_TYPES = ["welcome", "job", "cancel", "revoked", "error"] as const

export function parseAgentMessage(raw: string): AgentMessage {
  const frame = decodeFrame(raw)
  const type = asOneOf(frame.type, AGENT_MESSAGE_TYPES, "The frame type")
  switch (type) {
    case "hello":
      asId(frame.protocolVersion, "The protocol version")
      asId(frame.deviceId, "The device id")
      asId(frame.credential, "The device credential")
      asOneOf(frame.platform, DEVICE_PLATFORMS, "The device platform")
      asId(frame.agentVersion, "The agent version")
      parseCapabilityReports(frame.capabilities, "The capability report")
      return frame as unknown as AgentMessage
    case "heartbeat":
      return { type: "heartbeat" }
    case "capabilities":
      parseCapabilityReports(frame.capabilities, "The capability report")
      return frame as unknown as AgentMessage
    case "result":
      parseAgentResult(frame.result, "The job result")
      return frame as unknown as AgentMessage
  }
}

export function parseGatewayMessage(raw: string): GatewayMessage {
  const frame = decodeFrame(raw)
  const type = asOneOf(frame.type, GATEWAY_MESSAGE_TYPES, "The frame type")
  switch (type) {
    case "welcome":
      asId(frame.deviceId, "The device id")
      asId(frame.protocolVersion, "The protocol version")
      asId(frame.signingPublicKey, "The signing public key")
      asId(frame.keyId, "The signing key id")
      if (frame.keyRotation !== undefined) verifyKeyRotationShape(frame.keyRotation)
      return frame as unknown as GatewayMessage
    case "job":
      parseSignedJob(frame.job)
      return frame as unknown as GatewayMessage
    case "cancel":
      asId(frame.jobId, "The job id")
      return frame as unknown as GatewayMessage
    case "revoked":
      asString(frame.reason, "The revocation reason")
      return frame as unknown as GatewayMessage
    case "error":
      asOneOf(frame.code, ERROR_CODES, "The error code")
      asString(frame.message, "The error message")
      return frame as unknown as GatewayMessage
  }
}

function decodeFrame(raw: string): Record<string, unknown> {
  if (typeof raw !== "string") throw invalid("A frame must be a string.")
  if (raw.length === 0) throw invalid("A frame must not be empty.")
  if (raw.length > MAX_FRAME_BYTES) throw invalid("The frame is too large.")

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // The frame body is never echoed: it may carry a device credential.
    throw invalid("The frame is not valid JSON.")
  }
  return asRecord(parsed, "A frame")
}
