/**
 * Outbound frame construction (agent -> gateway).
 *
 * `hello` is the only frame that carries the device credential. It is built
 * here and encoded straight into the socket write — it is never logged, never
 * printed, and never stored anywhere but the credential store.
 */
import type { CapabilityReport, DevicePlatform } from "@cg/core"
import type { AgentMessage, AgentResult } from "@cg/protocol"
import { PROTOCOL_VERSION } from "@cg/protocol"
import type { AgentConfig } from "./config"
import { AGENT_VERSION } from "./identity"

export const HEARTBEAT_FRAME: AgentMessage = { type: "heartbeat" }

export function helloFrame(
  config: AgentConfig,
  platform: DevicePlatform,
  capabilities: readonly CapabilityReport[],
): AgentMessage {
  return {
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    deviceId: config.deviceId,
    credential: config.credential,
    platform,
    agentVersion: AGENT_VERSION,
    capabilities: [...capabilities],
  }
}

export function capabilitiesFrame(capabilities: readonly CapabilityReport[]): AgentMessage {
  return { type: "capabilities", capabilities: [...capabilities] }
}

export function resultFrame(result: AgentResult): AgentMessage {
  return { type: "result", result }
}

export function encodeFrame(message: AgentMessage): string {
  return JSON.stringify(message)
}
