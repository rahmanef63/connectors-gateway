import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { MAX_FRAME_BYTES, parseAgentMessage, parseGatewayMessage } from "./messages"

const HELLO = {
  type: "hello",
  protocolVersion: "1",
  deviceId: "dev_1",
  credential: "s3cret-token",
  platform: "linux",
  agentVersion: "0.1.0",
  capabilities: [
    { connector: "demo", status: "available", version: "4.2", adapterVersion: "0.1.0", capabilities: ["thing.do"] },
  ],
}

const RESULT = {
  type: "result",
  result: {
    jobId: "job_1",
    status: "success",
    output: { ok: true },
    files: [{ name: "render.png", mimeType: "image/png", sizeBytes: 12, ref: "file_1" }],
    error: null,
    timingMs: 12,
  },
}

const SIGNED_JOB = {
  payload: {
    id: "job_1",
    protocolVersion: "1",
    issuedAt: 1_000,
    expiresAt: 31_000,
    connector: "demo",
    action: "thing.do",
    input: { a: 1 },
    requestContext: { requestId: "req_1", userId: "usr_1" },
    nonce: "nce_1",
  },
  signature: "c2ln",
  keyId: "key_1",
}

function frame(value: unknown): string {
  return JSON.stringify(value)
}

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof GatewayError ? error.code : "NOT_A_GATEWAY_ERROR"
  }
  return "NO_THROW"
}

function rejects(parse: (raw: string) => unknown, values: unknown[]): void {
  for (const value of values) {
    expect(codeOf(() => parse(frame(value)))).toBe("INVALID_INPUT")
  }
}

describe("parseAgentMessage", () => {
  test("accepts every valid agent frame", () => {
    expect(parseAgentMessage(frame(HELLO)).type).toBe("hello")
    expect(parseAgentMessage(frame({ type: "heartbeat" }))).toEqual({ type: "heartbeat" })
    expect(parseAgentMessage(frame({ type: "capabilities", capabilities: [] })).type).toBe("capabilities")
    expect(parseAgentMessage(frame(RESULT)).type).toBe("result")
    expect(parseAgentMessage(frame({ ...RESULT, result: { jobId: "job_1", status: "error", timingMs: 1 } })).type).toBe(
      "result",
    )
  })

  test("rejects a missing, wrong-typed or unknown frame type", () => {
    rejects(parseAgentMessage, [{}, { type: 1 }, { type: "" }, { type: "welcome" }, { type: "nope" }, { type: null }])
  })

  test("rejects a frame that is not a JSON object", () => {
    expect(codeOf(() => parseAgentMessage("not json"))).toBe("INVALID_INPUT")
    expect(codeOf(() => parseAgentMessage(""))).toBe("INVALID_INPUT")
    expect(codeOf(() => parseAgentMessage("{"))).toBe("INVALID_INPUT")
    rejects(parseAgentMessage, [null, 42, "string", [HELLO], true])
  })

  test("rejects an oversized frame before parsing it", () => {
    const oversized = `{"type":"heartbeat","pad":"${"x".repeat(MAX_FRAME_BYTES)}"}`
    expect(codeOf(() => parseAgentMessage(oversized))).toBe("INVALID_INPUT")
  })

  test("rejects a hello with any field missing or malformed", () => {
    rejects(parseAgentMessage, [
      { ...HELLO, protocolVersion: undefined },
      { ...HELLO, deviceId: "" },
      { ...HELLO, credential: undefined },
      { ...HELLO, credential: 12 },
      { ...HELLO, platform: "solaris" },
      { ...HELLO, platform: undefined },
      { ...HELLO, agentVersion: null },
      { ...HELLO, capabilities: undefined },
      { ...HELLO, capabilities: {} },
      { ...HELLO, capabilities: [{ connector: "demo" }] },
      { ...HELLO, capabilities: [{ ...HELLO.capabilities[0], status: "maybe" }] },
      { ...HELLO, capabilities: [{ ...HELLO.capabilities[0], capabilities: "thing.do" }] },
      { ...HELLO, capabilities: [{ ...HELLO.capabilities[0], adapterVersion: undefined }] },
    ])
  })

  test("rejects a malformed result", () => {
    rejects(parseAgentMessage, [
      { type: "result" },
      { type: "result", result: null },
      { type: "result", result: { ...RESULT.result, jobId: undefined } },
      { type: "result", result: { ...RESULT.result, status: "partial" } },
      { type: "result", result: { ...RESULT.result, timingMs: "12" } },
      { type: "result", result: { ...RESULT.result, timingMs: -1 } },
      { type: "result", result: { ...RESULT.result, error: { code: "WAT", message: "x" } } },
      { type: "result", result: { ...RESULT.result, error: { code: "TIMEOUT" } } },
      { type: "result", result: { ...RESULT.result, files: {} } },
      { type: "result", result: { ...RESULT.result, files: [{ name: "a.png", mimeType: "image/png", ref: "r" }] } },
      { type: "result", result: { ...RESULT.result, files: [{ ...RESULT.result.files[0], sizeBytes: -1 }] } },
    ])
  })

  test("rejects a result file that carries a local path (docs/14)", () => {
    const paths = ["/home/u/render.png", "C:\\renders\\out.png", "../secret.png", "sub/dir.png", ".", ""]
    for (const name of paths) {
      const value = { type: "result", result: { ...RESULT.result, files: [{ ...RESULT.result.files[0], name }] } }
      expect(codeOf(() => parseAgentMessage(frame(value)))).toBe("INVALID_INPUT")
    }
  })
})

describe("parseGatewayMessage", () => {
  test("accepts every valid gateway frame", () => {
    const welcome = {
      type: "welcome",
      deviceId: "dev_1",
      protocolVersion: "1",
      signingPublicKey: "cHVi",
      keyId: "key_1",
    }
    expect(parseGatewayMessage(frame(welcome)).type).toBe("welcome")
    expect(parseGatewayMessage(frame({ type: "job", job: SIGNED_JOB })).type).toBe("job")
    expect(parseGatewayMessage(frame({ type: "cancel", jobId: "job_1" })).type).toBe("cancel")
    expect(parseGatewayMessage(frame({ type: "revoked", reason: "" })).type).toBe("revoked")
    expect(parseGatewayMessage(frame({ type: "error", code: "TIMEOUT", message: "late" })).type).toBe("error")
  })

  test("rejects a missing, unknown or agent-side frame type", () => {
    rejects(parseGatewayMessage, [{}, { type: "hello" }, { type: "heartbeat" }, { type: "unknown" }, { type: 3 }])
  })

  test("rejects a frame that is not JSON or not an object", () => {
    expect(codeOf(() => parseGatewayMessage("<html>"))).toBe("INVALID_INPUT")
    rejects(parseGatewayMessage, [null, [], "x", 0])
  })

  test("rejects an oversized frame", () => {
    expect(codeOf(() => parseGatewayMessage("x".repeat(MAX_FRAME_BYTES + 1)))).toBe("INVALID_INPUT")
  })

  test("accepts a well-shaped optional signed key-rotation proof on welcome", () => {
    const message = parseGatewayMessage(JSON.stringify({
      type: "welcome",
      deviceId: "dev_1",
      protocolVersion: "1",
      signingPublicKey: "cHVi",
      keyId: "key_2",
      keyRotation: {
        previousKeyId: "key_1",
        nextKeyId: "key_2",
        nextPublicKey: "cHVi",
        signature: "signed_rotation_proof",
      },
    }))
    expect(message.type).toBe("welcome")
    if (message.type === "welcome") expect(message.keyRotation?.previousKeyId).toBe("key_1")
  })

  test("rejects a partial optional key-rotation proof at the wire boundary", () => {
    expect(() => parseGatewayMessage(JSON.stringify({
      type: "welcome",
      deviceId: "dev_1",
      protocolVersion: "1",
      signingPublicKey: "cHVi",
      keyId: "key_2",
      keyRotation: { previousKeyId: "key_1", nextKeyId: "key_2" },
    }))).toThrow()
  })

  test("rejects malformed welcome, cancel, revoked and error frames", () => {
    rejects(parseGatewayMessage, [
      { type: "welcome", deviceId: "dev_1", protocolVersion: "1", signingPublicKey: "cHVi" },
      { type: "welcome", deviceId: "", protocolVersion: "1", signingPublicKey: "cHVi", keyId: "key_1" },
      { type: "cancel" },
      { type: "cancel", jobId: 1 },
      { type: "revoked" },
      { type: "revoked", reason: 1 },
      { type: "error", code: "NOPE", message: "x" },
      { type: "error", code: "TIMEOUT" },
      { type: "error", message: "x" },
    ])
  })

  test("rejects a malformed signed job", () => {
    const { payload } = SIGNED_JOB
    rejects(parseGatewayMessage, [
      { type: "job" },
      { type: "job", job: null },
      { type: "job", job: { ...SIGNED_JOB, signature: undefined } },
      { type: "job", job: { ...SIGNED_JOB, keyId: "" } },
      { type: "job", job: { ...SIGNED_JOB, payload: "x" } },
      { type: "job", job: { ...SIGNED_JOB, payload: { ...payload, id: undefined } } },
      { type: "job", job: { ...SIGNED_JOB, payload: { ...payload, issuedAt: "1000" } } },
      { type: "job", job: { ...SIGNED_JOB, payload: { ...payload, expiresAt: 999 } } },
      { type: "job", job: { ...SIGNED_JOB, payload: { ...payload, issuedAt: -1, expiresAt: 10 } } },
      { type: "job", job: { ...SIGNED_JOB, payload: { ...payload, nonce: 5 } } },
      { type: "job", job: { ...SIGNED_JOB, payload: { ...payload, requestContext: { requestId: "req_1" } } } },
      { type: "job", job: { ...SIGNED_JOB, payload: { ...payload, requestContext: null } } },
    ])
  })

  test("accepts a job whose input is any JSON value", () => {
    for (const value of [null, 0, "text", [1, 2], { nested: { deep: true } }]) {
      const job = { ...SIGNED_JOB, payload: { ...SIGNED_JOB.payload, input: value } }
      expect(parseGatewayMessage(frame({ type: "job", job })).type).toBe("job")
    }
  })
})
