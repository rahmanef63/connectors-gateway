/**
 * Job dispatcher that routes to the gateway process owning the device socket.
 *
 * Convex carries only short-lived route metadata. Signed jobs and agent results
 * are AES-GCM sealed end-to-end between gateway peers and never stored there.
 */
import { open, seal } from "@cg/auth"
import { ERROR_CODES, GatewayError, type ErrorCode } from "@cg/core"
import { parseAgentMessage, type AgentResult, type SignedJob } from "@cg/protocol"
import type { JobDispatcher } from "@cg/executor"
import type { RelayRouteStore } from "../store/relay-routes"
import type { Dispatcher } from "./dispatch"
import { MAX_DISPATCH_TIMEOUT_MS } from "./dispatch"
import { signPeerRequest } from "./peer-auth"

const MAX_PEER_RESPONSE_CHARS = 2 * 1024 * 1024

export type PeerFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export function createRoutedDispatcher(deps: {
  gatewayId: string
  local: Dispatcher
  routes: RelayRouteStore
  serviceToken: string
  encryptionKey: string
  fetcher?: PeerFetch
}): JobDispatcher {
  return {
    async dispatch(deviceId: string, job: SignedJob, timeoutMs: number): Promise<AgentResult> {
      const route = await deps.routes.resolve(deviceId)
      if (route === null) throw offline()
      if (route.gatewayId === deps.gatewayId) return deps.local.dispatch(deviceId, job, timeoutMs)

      const budget = Number.isFinite(timeoutMs)
        ? Math.min(Math.max(timeoutMs, 1), MAX_DISPATCH_TIMEOUT_MS)
        : MAX_DISPATCH_TIMEOUT_MS
      const payloadCipher = await seal(JSON.stringify(job), deps.encryptionKey)
      const body = JSON.stringify({
        deviceId,
        sessionId: route.sessionId,
        payloadCipher,
        timeoutMs: budget,
      })
      const auth = signPeerRequest(deps.serviceToken, body)
      let response: Response
      try {
        response = await (deps.fetcher ?? fetch)(`${route.internalUrl}/internal/relay/dispatch`, {
          method: "POST",
          redirect: "manual",
          headers: {
            "content-type": "application/json",
            "x-cg-peer-timestamp": auth.timestamp,
            "x-cg-peer-nonce": auth.nonce,
            "x-cg-peer-signature": auth.signature,
          },
          body,
          signal: AbortSignal.timeout(budget + 5_000),
        })
      } catch {
        // Ambiguous transport failures are never replayed. The peer may have
        // already delivered a non-idempotent local action to the agent.
        throw new GatewayError("UPSTREAM_ERROR", "The device relay did not return a result.")
      }
      if (response.status >= 300 && response.status < 400) {
        throw new GatewayError("UPSTREAM_ERROR", "The device relay refused a redirect.")
      }
      const raw = await response.text()
      if (raw.length > MAX_PEER_RESPONSE_CHARS) {
        throw new GatewayError("UPSTREAM_ERROR", "The device relay returned an oversized response.")
      }
      let document: unknown
      try { document = JSON.parse(raw) } catch { throw malformed() }
      if (typeof document !== "object" || document === null || Array.isArray(document)) throw malformed()
      const row = document as Record<string, unknown>
      if (row.ok === false) throw peerError(row.errorCode)
      if (row.ok !== true || typeof row.resultCipher !== "string") throw malformed()

      let parsed: unknown
      try { parsed = JSON.parse(await open(row.resultCipher, deps.encryptionKey)) } catch { throw malformed() }
      const frame = parseAgentMessage(JSON.stringify({ type: "result", result: parsed }))
      if (frame.type !== "result") throw malformed()
      if (frame.result.jobId !== job.payload.id) throw malformed()
      return frame.result
    },
  }
}

function peerError(value: unknown): GatewayError {
  if (typeof value !== "string" || !(ERROR_CODES as readonly string[]).includes(value)) return malformed()
  const code = value as ErrorCode
  switch (code) {
    case "DEVICE_REVOKED": return new GatewayError(code, "The device was revoked.")
    case "DEVICE_OFFLINE": return offline()
    case "TIMEOUT": return new GatewayError(code, "The device did not answer in time.")
    case "REPLAY_DETECTED": return new GatewayError(code, "The device job was already in flight.")
    default: return new GatewayError(code, "The device relay could not complete the action.")
  }
}

function offline(): GatewayError {
  return new GatewayError("DEVICE_OFFLINE", "The device is not connected.")
}
function malformed(): GatewayError {
  return new GatewayError("UPSTREAM_ERROR", "The device relay returned an invalid response.")
}
