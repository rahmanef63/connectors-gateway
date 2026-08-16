import { describe, expect, test } from "bun:test"
import type { AuditEvent } from "@cg/core"
import { buildAuditEvent } from "./audit"

const AUDIT_FIELDS = [
  "requestId",
  "timestamp",
  "actorId",
  "userId",
  "workspaceId",
  "connectorId",
  "actionId",
  "executorKind",
  "deviceId",
  "connectionId",
  "policyDecision",
  "status",
  "latencyMs",
  "errorCode",
]

function baseInput(): AuditEvent {
  return {
    requestId: "req_1",
    timestamp: 1_700_000_000_000,
    actorId: "caller_gpt",
    userId: "user_1",
    connectorId: "blender",
    actionId: "blender.scene.render",
    executorKind: "local",
    policyDecision: "ALLOW",
    status: "success",
    latencyMs: 42,
  }
}

describe("buildAuditEvent", () => {
  test("keeps identifiers and outcomes only", () => {
    const event = buildAuditEvent({
      ...baseInput(),
      workspaceId: "ws_1",
      deviceId: "dev_1",
      connectionId: "conn_1",
      errorCode: "TIMEOUT",
      status: "error",
    })

    expect(Object.keys(event).sort()).toEqual(
      [
        "requestId",
        "timestamp",
        "actorId",
        "userId",
        "connectorId",
        "actionId",
        "executorKind",
        "policyDecision",
        "status",
        "latencyMs",
        "workspaceId",
        "deviceId",
        "connectionId",
        "errorCode",
      ].sort(),
    )
    expect(event.errorCode).toBe("TIMEOUT")
  })

  test("DENIED: payload-ish extras are dropped, never copied through", () => {
    const smuggled = {
      ...baseInput(),
      input: { prompt: "render my scene" },
      output: { file: "/home/user/frame.png" },
      token: "sk-live-1",
      credential: "dev-cred",
      files: [{ name: "/home/user/frame.png" }],
    } as unknown as AuditEvent

    const event = buildAuditEvent(smuggled)

    for (const key of Object.keys(event)) expect(AUDIT_FIELDS).toContain(key)
    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain("render my scene")
    expect(serialized).not.toContain("sk-live-1")
    expect(serialized).not.toContain("/home/user")
  })

  test("omits absent optional fields and defaults the timestamp", () => {
    const before = Date.now()
    const { timestamp, ...rest } = baseInput()
    void timestamp
    const event = buildAuditEvent(rest)

    expect(event.timestamp).toBeGreaterThanOrEqual(before)
    expect("workspaceId" in event).toBe(false)
    expect("deviceId" in event).toBe(false)
    expect("errorCode" in event).toBe(false)
  })
})
