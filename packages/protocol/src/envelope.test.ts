import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { MAX_JOB_TTL_MS, createJobEnvelope, type CreateJobEnvelopeInput } from "./envelope"
import { parseJobEnvelope } from "./job-guards"
import { DEFAULT_JOB_TTL_MS, PROTOCOL_VERSION } from "./types"

const NOW = 1_760_000_000_000

function input(overrides: Partial<CreateJobEnvelopeInput> = {}): CreateJobEnvelopeInput {
  return {
    connector: "demo",
    action: "thing.do",
    input: { a: 1 },
    requestContext: { requestId: "req_1", userId: "usr_1", workspaceId: "wrk_1" },
    now: NOW,
    ...overrides,
  }
}

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof GatewayError ? error.code : "NOT_A_GATEWAY_ERROR"
  }
  return "NO_THROW"
}

describe("createJobEnvelope", () => {
  test("builds a complete, parseable envelope", () => {
    const envelope = createJobEnvelope(input())
    expect(envelope.id.startsWith("job_")).toBe(true)
    expect(envelope.nonce.startsWith("nce_")).toBe(true)
    expect(envelope.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(envelope.issuedAt).toBe(NOW)
    expect(envelope.expiresAt).toBe(NOW + DEFAULT_JOB_TTL_MS)
    expect(envelope.connector).toBe("demo")
    expect(envelope.action).toBe("thing.do")
    expect(envelope.input).toEqual({ a: 1 })
    expect(envelope.requestContext).toEqual({ requestId: "req_1", userId: "usr_1", workspaceId: "wrk_1" })
    expect(parseJobEnvelope(JSON.parse(JSON.stringify(envelope)))).toBeDefined()
  })

  test("honours an explicit ttl", () => {
    expect(createJobEnvelope(input({ ttlMs: 5_000 })).expiresAt).toBe(NOW + 5_000)
  })

  test("omits an absent workspace instead of writing undefined", () => {
    const envelope = createJobEnvelope(input({ requestContext: { requestId: "req_1", userId: "usr_1" } }))
    expect("workspaceId" in envelope.requestContext).toBe(false)
  })

  test("gives every job a unique id and nonce", () => {
    const ids = new Set<string>()
    const nonces = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      const envelope = createJobEnvelope(input())
      ids.add(envelope.id)
      nonces.add(envelope.nonce)
    }
    expect(ids.size).toBe(200)
    expect(nonces.size).toBe(200)
  })

  test("rejects a missing or malformed connector and action", () => {
    expect(codeOf(() => createJobEnvelope(input({ connector: "" })))).toBe("INVALID_INPUT")
    expect(codeOf(() => createJobEnvelope(input({ action: "" })))).toBe("INVALID_INPUT")
    expect(codeOf(() => createJobEnvelope(input({ connector: 7 as unknown as string })))).toBe("INVALID_INPUT")
  })

  test("rejects an incomplete request context", () => {
    const bad = [
      { requestId: "req_1" },
      { userId: "usr_1" },
      { requestId: "req_1", userId: "" },
      { requestId: "req_1", userId: "usr_1", workspaceId: 3 },
      "not-an-object",
      null,
    ]
    for (const requestContext of bad) {
      expect(codeOf(() => createJobEnvelope(input({ requestContext: requestContext as never })))).toBe("INVALID_INPUT")
    }
  })

  test("rejects a ttl outside the allowed window", () => {
    expect(codeOf(() => createJobEnvelope(input({ ttlMs: 0 })))).toBe("INVALID_INPUT")
    expect(codeOf(() => createJobEnvelope(input({ ttlMs: -1 })))).toBe("INVALID_INPUT")
    expect(codeOf(() => createJobEnvelope(input({ ttlMs: MAX_JOB_TTL_MS + 1 })))).toBe("INVALID_INPUT")
    expect(codeOf(() => createJobEnvelope(input({ ttlMs: Number.POSITIVE_INFINITY })))).toBe("INVALID_INPUT")
  })

  test("rejects an unusable clock", () => {
    expect(codeOf(() => createJobEnvelope(input({ now: Number.NaN })))).toBe("INVALID_INPUT")
    expect(codeOf(() => createJobEnvelope(input({ now: -1 })))).toBe("INVALID_INPUT")
  })
})
