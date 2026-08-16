import { describe, expect, test } from "bun:test"
import {
  fakeApiKeys,
  fakeDevices,
  fakeExecutor,
  fakePolicy,
  makeDevice,
  pipelineDeps,
  scope,
  testApiKey,
  TEST_CONNECTOR,
  TEST_LOCAL_CONNECTOR,
} from "../__tests__/fixtures"
import { executeAction } from "./execute"

async function run(
  overrides: Parameters<typeof pipelineDeps>[0] = {},
  input: Record<string, unknown> = {},
) {
  const deps = await pipelineDeps(overrides)
  const { token } = await testApiKey()
  const result = await executeAction(deps, {
    scope: scope(),
    token,
    connectorId: TEST_CONNECTOR,
    actionId: "testcloud.echo",
    input,
  })
  return { deps, result }
}

describe("executeAction — denied paths", () => {
  test("no bearer token yields NOT_AUTHENTICATED", async () => {
    const deps = await pipelineDeps()
    const result = await executeAction(deps, {
      scope: scope(),
      token: null,
      connectorId: TEST_CONNECTOR,
      actionId: "testcloud.echo",
      input: {},
    })
    expect(result.status).toBe("error")
    expect(result.error?.code).toBe("NOT_AUTHENTICATED")
    // No principal means no attributable audit row (see `record`).
    expect(deps.audit.events).toHaveLength(0)
    expect(deps.executor.requests).toHaveLength(0)
  })

  test("an unknown key yields NOT_AUTHENTICATED", async () => {
    const deps = await pipelineDeps({ apiKeys: fakeApiKeys(null) })
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_CONNECTOR,
      actionId: "testcloud.echo",
      input: {},
    })
    expect(result.error?.code).toBe("NOT_AUTHENTICATED")
  })

  test("unknown action yields ACTION_NOT_FOUND and still writes an audit row", async () => {
    const deps = await pipelineDeps()
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_CONNECTOR,
      actionId: "testcloud.nope",
      input: {},
    })
    expect(result.error?.code).toBe("ACTION_NOT_FOUND")
    expect(deps.audit.events).toHaveLength(1)
    expect(deps.audit.events[0]?.errorCode).toBe("ACTION_NOT_FOUND")
    expect(deps.executor.requests).toHaveLength(0)
  })

  test("unknown connector yields CONNECTOR_NOT_FOUND", async () => {
    const deps = await pipelineDeps()
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: "nope",
      actionId: "testcloud.echo",
      input: {},
    })
    expect(result.error?.code).toBe("CONNECTOR_NOT_FOUND")
  })

  test("input that violates the schema yields INVALID_INPUT", async () => {
    const deps = await pipelineDeps()
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_CONNECTOR,
      actionId: "testcloud.strict",
      input: { value: 42 },
    })
    expect(result.error?.code).toBe("INVALID_INPUT")
    expect(deps.executor.requests).toHaveLength(0)
    expect(deps.audit.events[0]?.status).toBe("error")
  })

  test("an INVALID_INPUT message never echoes the rejected value", async () => {
    const deps = await pipelineDeps()
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_CONNECTOR,
      actionId: "testcloud.strict",
      input: { value: 42, leaked: "sk-live-51H8ZsecretTOKEN" },
    })
    expect(result.error?.code).toBe("INVALID_INPUT")
    expect(result.error?.message ?? "").not.toContain("sk-live")
  })

  test("policy DENY yields POLICY_DENIED and still writes an audit row", async () => {
    const deps = await pipelineDeps()
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_CONNECTOR,
      actionId: "testcloud.forbidden",
      input: {},
    })
    expect(result.error?.code).toBe("POLICY_DENIED")
    expect(deps.executor.requests).toHaveLength(0)
    expect(deps.audit.events).toHaveLength(1)
    expect(deps.audit.events[0]?.policyDecision).toBe("DENY")
    expect(deps.audit.events[0]?.errorCode).toBe("POLICY_DENIED")
  })

  test("an explicit ALLOW rule cannot raise an R4 action", async () => {
    const deps = await pipelineDeps({
      policy: fakePolicy([
        { connectorId: TEST_CONNECTOR, actionId: "testcloud.forbidden", decision: "ALLOW" },
      ]),
    })
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_CONNECTOR,
      actionId: "testcloud.forbidden",
      input: {},
    })
    expect(result.error?.code).toBe("POLICY_DENIED")
  })

  test("REQUIRE_APPROVAL yields APPROVAL_REQUIRED and is marked in the audit log", async () => {
    const deps = await pipelineDeps()
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_CONNECTOR,
      actionId: "testcloud.risky",
      input: {},
    })
    expect(result.error?.code).toBe("APPROVAL_REQUIRED")
    expect(deps.executor.requests).toHaveLength(0)
    expect(deps.audit.events[0]?.policyDecision).toBe("REQUIRE_APPROVAL")
  })

  test("a local action without a capable device is denied by policy", async () => {
    const deps = await pipelineDeps({ devices: fakeDevices([makeDevice()]) })
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_LOCAL_CONNECTOR,
      actionId: "testlocal.render",
      input: {},
    })
    expect(result.error?.code).toBe("POLICY_DENIED")
    expect(deps.audit.events[0]?.executorKind).toBe("local")
  })

  test("an offline device does not satisfy a capability requirement", async () => {
    const deps = await pipelineDeps({
      devices: fakeDevices([
        makeDevice({ status: "offline", capabilities: ["testlocal:render"] }),
      ]),
    })
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_LOCAL_CONNECTOR,
      actionId: "testlocal.render",
      input: {},
    })
    expect(result.error?.code).toBe("POLICY_DENIED")
  })
})

describe("executeAction — allowed path", () => {
  test("writes exactly one audit row with a latency and the decision", async () => {
    const { deps, result } = await run()
    expect(result.status).toBe("success")
    expect(deps.audit.events).toHaveLength(1)
    const event = deps.audit.events[0]
    expect(event?.policyDecision).toBe("ALLOW")
    expect(event?.status).toBe("success")
    expect(event?.actorId).toBe("keytest1")
    expect(event?.userId).toBe("usr_1")
    expect(event?.connectorId).toBe(TEST_CONNECTOR)
    expect(event?.actionId).toBe("testcloud.echo")
    expect(event?.executorKind).toBe("cloud")
    expect(typeof event?.latencyMs).toBe("number")
    expect(event?.latencyMs).toBeGreaterThanOrEqual(0)
    expect(event?.errorCode).toBeUndefined()
  })

  test("a caller-supplied user_id is dropped before the executor sees it", async () => {
    const { deps } = await run({}, { user_id: "usr_attacker", workspaceId: "wrk_x", keep: "yes" })
    const input = deps.executor.requests[0]?.input as Record<string, unknown>
    expect(input).toEqual({ keep: "yes" })
    // Identity still comes from the authenticated principal.
    expect(deps.executor.requests[0]?.context.principal.userId).toBe("usr_1")
    expect(deps.audit.events[0]?.userId).toBe("usr_1")
  })

  test("an executor error is normalized and audited, not thrown", async () => {
    const deps = await pipelineDeps({
      executor: fakeExecutor({
        status: "error",
        error: { code: "DEVICE_OFFLINE", message: "No device." },
        timingMs: 3,
      }),
    })
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_CONNECTOR,
      actionId: "testcloud.echo",
      input: {},
    })
    expect(result.error?.code).toBe("DEVICE_OFFLINE")
    expect(deps.audit.events[0]?.errorCode).toBe("DEVICE_OFFLINE")
    expect(deps.audit.events[0]?.status).toBe("error")
  })

  test("an audit sink failure does not turn a completed action into a 500", async () => {
    const deps = await pipelineDeps()
    deps.audit.append = async () => {
      throw new Error("convex down")
    }
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_CONNECTOR,
      actionId: "testcloud.echo",
      input: {},
    })
    // The side effect already happened; reporting a failure would be a lie.
    expect(result.status).toBe("success")
  })
})


describe("REQUIRE_APPROVAL with persistence", () => {
  // `testcloud.risky` is R2, whose baseline decision is REQUIRE_APPROVAL.
  const RISKY = "testcloud.risky"

  function approvalStub(claimAnswer: boolean, requestThrows = false) {
    const requested: unknown[] = []
    let claims = 0
    return {
      requested,
      claimCount: () => claims,
      store: {
        async claim() {
          claims += 1
          return claimAnswer
        },
        async request(input: unknown) {
          if (requestThrows) throw new Error("control plane down")
          requested.push(input)
        },
      },
    }
  }

  async function callRisky(store?: unknown, input: Record<string, unknown> = { a: 1 }) {
    const deps = await pipelineDeps(store === undefined ? {} : ({ approvals: store } as never))
    const { token } = await testApiKey()
    const result = await executeAction(deps, {
      scope: scope(),
      token,
      connectorId: TEST_CONNECTOR,
      actionId: RISKY,
      input,
    })
    return { deps, result }
  }

  test("queues the call and still refuses when nothing is approved", async () => {
    const stub = approvalStub(false)
    const { result } = await callRisky(stub.store)
    expect(result.error?.code).toBe("APPROVAL_REQUIRED")
    // Refused AND recorded — a screen with nothing on it is the gap this closes.
    expect(stub.requested).toHaveLength(1)
  })

  test("proceeds once an approval for THIS call exists, spending it", async () => {
    const stub = approvalStub(true)
    const { result } = await callRisky(stub.store)
    expect(result.status).toBe("success")
    expect(stub.claimCount()).toBe(1)
    // Nothing re-queued: it was already answered.
    expect(stub.requested).toHaveLength(0)
  })

  test("still refuses with no store configured — absence is not permission", async () => {
    const { result } = await callRisky()
    expect(result.error?.code).toBe("APPROVAL_REQUIRED")
  })

  test("refuses when the queue write fails, rather than letting the call through", async () => {
    const stub = approvalStub(false, true)
    const { result } = await callRisky(stub.store)
    expect(result.error?.code).toBe("APPROVAL_REQUIRED")
  })

  test("never executes the action on the refused path", async () => {
    const stub = approvalStub(false)
    const { deps } = await callRisky(stub.store)
    expect(deps.executor.requests).toHaveLength(0)
  })
})
