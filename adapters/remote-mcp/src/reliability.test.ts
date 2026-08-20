import { beforeEach, describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import {
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_OPEN_MS,
  assertCircuitAllows,
  recordCircuitNonTransientOutcome,
  recordCircuitSuccess,
  recordCircuitTransientFailure,
  remoteMcpDiagnostics,
  resetRemoteMcpReliabilityForTests,
  upstreamCircuitKey,
} from "./reliability"

beforeEach(resetRemoteMcpReliabilityForTests)
const ID = "fixture"
const KEY = upstreamCircuitKey(ID, "https://tenant.example.com/mcp")

describe("remote MCP circuit breaker", () => {
  test("opens only after repeated transient failures", () => {
    for (let i = 1; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) {
      recordCircuitTransientFailure(ID, KEY, 1000)
      expect(() => assertCircuitAllows(ID, KEY, 1001)).not.toThrow()
    }
    recordCircuitTransientFailure(ID, KEY, 1000)
    const error = (() => { try { assertCircuitAllows(ID, KEY, 1001) } catch (e) { return e } })()
    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).details).toEqual({ retryable: true })
  })

  test("after cooldown exactly one half-open probe is allowed", () => {
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) recordCircuitTransientFailure(ID, KEY, 1000)
    expect(() => assertCircuitAllows(ID, KEY, 1000 + CIRCUIT_OPEN_MS)).not.toThrow()
    expect(() => assertCircuitAllows(ID, KEY, 1000 + CIRCUIT_OPEN_MS)).toThrow(GatewayError)
    recordCircuitSuccess(ID, KEY)
    expect(() => assertCircuitAllows(ID, KEY, 1000 + CIRCUIT_OPEN_MS)).not.toThrow()
  })

  test("a failed half-open probe reopens immediately", () => {
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) recordCircuitTransientFailure(ID, KEY, 1000)
    assertCircuitAllows(ID, KEY, 1000 + CIRCUIT_OPEN_MS)
    recordCircuitTransientFailure(ID, KEY, 1000 + CIRCUIT_OPEN_MS)
    expect(() => assertCircuitAllows(ID, KEY, 1000 + CIRCUIT_OPEN_MS + 1)).toThrow(GatewayError)
  })

  test("a reachable application/auth failure heals a half-open circuit", () => {
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) recordCircuitTransientFailure(ID, KEY, 1000)
    assertCircuitAllows(ID, KEY, 1000 + CIRCUIT_OPEN_MS)
    recordCircuitNonTransientOutcome(ID, KEY)
    expect(remoteMcpDiagnostics()[0]?.state).toBe("closed")
  })

  test("diagnostics contain only connector id and irreversible upstream reference", () => {
    recordCircuitTransientFailure(ID, KEY, 1000)
    const text = JSON.stringify(remoteMcpDiagnostics())
    expect(text).toContain(ID)
    expect(text).not.toContain("tenant.example.com")
    expect(text).not.toContain("https://")
  })

  test("different upstream origins do not trip each other", () => {
    const other = upstreamCircuitKey(ID, "https://other.example.com/mcp")
    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) recordCircuitTransientFailure(ID, KEY, 1000)
    expect(() => assertCircuitAllows(ID, other, 1001)).not.toThrow()
  })
})
