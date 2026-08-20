import { createHash } from "node:crypto"
import { GatewayError } from "@cg/core"

export const CIRCUIT_FAILURE_THRESHOLD = 3
export const CIRCUIT_OPEN_MS = 30_000

type CircuitState = {
  state: "closed" | "open" | "half-open"
  consecutiveFailures: number
  openedAt?: number
  probeInFlight: boolean
}

export type RemoteMcpDiagnostic = {
  connectorId: string
  upstreamRef: string
  state: "closed" | "open" | "half-open"
  consecutiveFailures: number
}

const circuits = new Map<string, { connectorId: string; state: CircuitState }>()

export function upstreamCircuitKey(connectorId: string, baseUrl: string): string {
  let origin: string
  try { origin = new URL(baseUrl).origin } catch { origin = "invalid" }
  // This identifier is deliberately irreversible in diagnostics: operators can
  // correlate repeated failures without disclosing a tenant's self-hosted URL.
  const digest = createHash("sha256").update(`${connectorId}\0${origin}`).digest("hex").slice(0, 12)
  return `${connectorId}:${digest}`
}

export function assertCircuitAllows(connectorId: string, key: string, now = Date.now()): void {
  const entry = circuits.get(key)
  if (!entry) return
  const circuit = entry.state
  if (circuit.state === "open") {
    const elapsed = now - (circuit.openedAt ?? now)
    if (elapsed < CIRCUIT_OPEN_MS) throw circuitOpen()
    circuit.state = "half-open"
    circuit.probeInFlight = false
  }
  if (circuit.state === "half-open") {
    if (circuit.probeInFlight) throw circuitOpen()
    circuit.probeInFlight = true
  }
  entry.connectorId = connectorId
}

export function recordCircuitSuccess(connectorId: string, key: string): void {
  circuits.set(key, {
    connectorId,
    state: { state: "closed", consecutiveFailures: 0, probeInFlight: false },
  })
}

export function recordCircuitTransientFailure(connectorId: string, key: string, now = Date.now()): void {
  const previous = circuits.get(key)?.state
  const failures = (previous?.consecutiveFailures ?? 0) + 1
  const shouldOpen = previous?.state === "half-open" || failures >= CIRCUIT_FAILURE_THRESHOLD
  circuits.set(key, {
    connectorId,
    state: shouldOpen
      ? { state: "open", consecutiveFailures: failures, openedAt: now, probeInFlight: false }
      : { state: "closed", consecutiveFailures: failures, probeInFlight: false },
  })
}

export function recordCircuitNonTransientOutcome(connectorId: string, key: string): void {
  // Auth/schema/application failures prove the transport is reachable, so they
  // must heal a half-open breaker rather than keeping the upstream quarantined.
  recordCircuitSuccess(connectorId, key)
}

export function remoteMcpDiagnostics(): RemoteMcpDiagnostic[] {
  return [...circuits.entries()]
    .map(([key, entry]) => ({
      connectorId: entry.connectorId,
      upstreamRef: key.split(":").at(-1) ?? "unknown",
      state: entry.state.state,
      consecutiveFailures: entry.state.consecutiveFailures,
    }))
    .sort((a, b) => `${a.connectorId}:${a.upstreamRef}`.localeCompare(`${b.connectorId}:${b.upstreamRef}`))
}

export function resetRemoteMcpReliabilityForTests(): void { circuits.clear() }

function circuitOpen(): GatewayError {
  return new GatewayError(
    "UPSTREAM_ERROR",
    "The upstream connector is temporarily unavailable after repeated failures.",
    { retryable: true },
  )
}
