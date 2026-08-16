/**
 * What happens to a frame the gateway sends us.
 *
 * Split from session.ts (which owns the connection lifecycle) because this is
 * the trust boundary: every inbound frame is parsed before a single field is
 * read, and no handler here may throw — an exception on this path would take
 * the session down (AGENTS.md P0).
 */
import { parseGatewayMessage, PROTOCOL_VERSION } from "@cg/protocol"
import type { AgentMessage, GatewayMessage } from "@cg/protocol"
import { resultFrame } from "./frames"
import type { JobRunner } from "./jobs"
import type { Logger } from "./log"
import type { PinnedKey } from "./key-store"

export type InboundDeps = {
  /** The device id this agent is paired as; a welcome for another one is fatal. */
  deviceId: string
  runner: JobRunner
  logger: Logger
  send(message: AgentMessage): void
  /** False once a newer socket has replaced the one that delivered the frame. */
  isCurrent(): boolean
  /** Called for a condition that re-pairing, not retrying, fixes. */
  stop(): void
  /** Pins the announced signing key, or refuses it. Never throws. */
  trustKey(key: PinnedKey): Promise<void>
  /** Called when the gateway accepts us: the session is fully established. */
  onOnline(): void
}

export type InboundHandler = (raw: string) => Promise<void>

export function createInboundHandler(deps: InboundDeps): InboundHandler {
  return async (raw: string): Promise<void> => {
    if (!deps.isCurrent()) return
    let message: GatewayMessage
    try {
      message = parseGatewayMessage(raw)
    } catch {
      // The body may carry attacker-chosen text; only the fact is logged.
      deps.logger.warn("dropped an unreadable gateway frame")
      return
    }
    try {
      await dispatch(deps, message)
    } catch {
      deps.logger.error("a gateway frame could not be handled")
    }
  }
}

async function dispatch(deps: InboundDeps, message: GatewayMessage): Promise<void> {
  switch (message.type) {
    case "welcome":
      await handleWelcome(deps, message)
      return
    case "job": {
      // `run` never rejects: every outcome becomes exactly one result frame.
      const result = await deps.runner.run(message.job)
      if (deps.isCurrent()) deps.send(resultFrame(result))
      return
    }
    case "cancel":
      deps.runner.cancel(message.jobId)
      return
    case "revoked":
      // The reason is gateway-supplied text and is deliberately not printed.
      deps.logger.error("this device was revoked by its owner. Run: agent revoke-local, then agent pair")
      deps.stop()
      return
    case "error":
      deps.logger.warn(`the gateway rejected a frame (${message.code})`)
      return
  }
}

async function handleWelcome(
  deps: InboundDeps,
  message: Extract<GatewayMessage, { type: "welcome" }>,
): Promise<void> {
  if (message.protocolVersion !== PROTOCOL_VERSION) {
    deps.logger.error("the gateway speaks a different protocol version. Upgrade the agent")
    deps.stop()
    return
  }
  if (message.deviceId !== deps.deviceId) {
    deps.logger.error("the gateway greeted a different device id. Run: agent pair")
    deps.stop()
    return
  }
  await deps.trustKey({ signingPublicKey: message.signingPublicKey, keyId: message.keyId })
  // Online either way: a refused key does not break presence, it breaks jobs,
  // and each one then fails with its own NOT_AUTHORIZED result.
  deps.onOnline()
}
