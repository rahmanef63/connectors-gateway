/**
 * The `hello` handshake — the only frame an unauthenticated socket may send.
 *
 * Close codes are part of the contract: 4001 tells the agent to re-pair, 4003
 * tells it to STOP reconnecting, 4004 is a version mismatch (@cg/protocol).
 */
import type { CapabilityReport, Device } from "@cg/core"
import { CLOSE_CODES, PROTOCOL_VERSION } from "@cg/protocol"
import type { AgentMessage } from "@cg/protocol"
import { namespaceCapabilities } from "@cg/executor"
import type { GatewayDeviceStore } from "../store/devices"

export type HelloMessage = Extract<AgentMessage, { type: "hello" }>

export type HelloOutcome =
  | { ok: true; device: Device; capabilities: string[] }
  | { ok: false; code: number; reason: string }

/**
 * A device announces `scene.render` per adapter; the relay stores the namespaced
 * form so one connector can never satisfy another connector's requirement.
 * Only `available` adapters count.
 */
export function flattenCapabilities(reports: readonly CapabilityReport[]): string[] {
  const capabilities = new Set<string>()
  for (const report of reports) {
    if (report.status !== "available") continue
    for (const capability of namespaceCapabilities(report.connector, report.capabilities)) {
      capabilities.add(capability)
    }
  }
  return [...capabilities]
}

export async function authenticateHello(
  devices: GatewayDeviceStore,
  message: HelloMessage,
): Promise<HelloOutcome> {
  if (message.protocolVersion !== PROTOCOL_VERSION) {
    return { ok: false, code: CLOSE_CODES.UNSUPPORTED, reason: "unsupported protocol version" }
  }

  const auth = await devices.authenticateDevice(message.deviceId, message.credential)
  if (!auth.ok) {
    return auth.reason === "revoked"
      ? { ok: false, code: CLOSE_CODES.REVOKED, reason: "device revoked" }
      : { ok: false, code: CLOSE_CODES.UNAUTHORIZED, reason: "credential rejected" }
  }

  return { ok: true, device: auth.device, capabilities: flattenCapabilities(message.capabilities) }
}
