import { describe, expect, test } from "bun:test"
import { DEFAULT_JOB_TTL_MS, PROTOCOL_VERSION } from "@cg/protocol"
import type { AgentResult, JobEnvelope, SignedJob } from "@cg/protocol"
import { createLocalExecutor } from "./local"
import { fakeDevices, makeAction, makeContext, makeRequest, makeDevice } from "./__tests__/fixtures"
import type { JobDispatcher } from "./types"

const RENDER = "blender:scene.render"

function signJob(envelope: JobEnvelope): SignedJob {
  return { payload: envelope, signature: "sig", keyId: "key_1" }
}

function dispatcherReturning(
  build: (job: SignedJob) => AgentResult | Promise<AgentResult>,
): JobDispatcher & { jobs: SignedJob[]; deviceIds: string[]; timeouts: number[] } {
  const jobs: SignedJob[] = []
  const deviceIds: string[] = []
  const timeouts: number[] = []
  return {
    jobs,
    deviceIds,
    timeouts,
    async dispatch(deviceId, job, timeoutMs) {
      jobs.push(job)
      deviceIds.push(deviceId)
      timeouts.push(timeoutMs)
      return build(job)
    },
  }
}

const capableDevice = makeDevice({ capabilities: [RENDER, "blender:scene.info"] })

const renderAction = makeAction({ requiredCapabilities: ["scene.render"] })

describe("createLocalExecutor", () => {
  test("signs a job for a capable online device and returns its output", async () => {
    const dispatcher = dispatcherReturning((job) => ({
      jobId: job.payload.id,
      status: "success",
      output: { frames: 1 },
      timingMs: 12,
    }))
    const executor = createLocalExecutor({
      devices: fakeDevices([capableDevice]),
      dispatcher,
      signJob,
    })

    const result = await executor.execute(
      makeRequest("local", { action: renderAction, timeoutMs: 4_000 }),
    )

    expect(result.status).toBe("success")
    expect(result.output).toEqual({ frames: 1 })
    expect(dispatcher.deviceIds).toEqual(["dev_1"])
    expect(dispatcher.timeouts).toEqual([4_000])

    const envelope = dispatcher.jobs[0]?.payload
    expect(envelope?.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(envelope?.connector).toBe("blender")
    expect(envelope?.action).toBe("blender.scene.render")
    expect(envelope?.input).toEqual({ camera: "main" })
    // Identity is attached server-side from the principal, never from input.
    expect(envelope?.requestContext).toEqual({ requestId: "req_test", userId: "user_1" })
    expect(envelope?.nonce).toBeTruthy()
    expect((envelope?.expiresAt ?? 0) - (envelope?.issuedAt ?? 0)).toBe(DEFAULT_JOB_TTL_MS)
  })

  test("carries workspaceId when the principal has one, and honours ttlMs", async () => {
    const dispatcher = dispatcherReturning((job) => ({
      jobId: job.payload.id,
      status: "success",
      timingMs: 1,
    }))
    const executor = createLocalExecutor({
      devices: fakeDevices([capableDevice]),
      dispatcher,
      signJob,
      ttlMs: 1_000,
    })

    await executor.execute(
      makeRequest("local", {
        action: renderAction,
        context: makeContext({
          principal: { callerId: "caller_gpt", userId: "user_1", workspaceId: "ws_1", scopes: [] },
        }),
      }),
    )

    const envelope = dispatcher.jobs[0]?.payload
    expect(envelope?.requestContext.workspaceId).toBe("ws_1")
    expect((envelope?.expiresAt ?? 0) - (envelope?.issuedAt ?? 0)).toBe(1_000)
  })

  test("DENIED: no online device -> DEVICE_OFFLINE", async () => {
    const dispatcher = dispatcherReturning(() => {
      throw new Error("must not dispatch")
    })
    const executor = createLocalExecutor({
      devices: fakeDevices([makeDevice({ status: "offline", capabilities: [RENDER] })]),
      dispatcher,
      signJob,
    })

    const result = await executor.execute(makeRequest("local", { action: renderAction }))

    expect(result.status).toBe("error")
    expect(result.error?.code).toBe("DEVICE_OFFLINE")
    expect(dispatcher.jobs).toHaveLength(0)
  })

  test("DENIED: no devices at all -> DEVICE_OFFLINE", async () => {
    const executor = createLocalExecutor({
      devices: fakeDevices([]),
      dispatcher: dispatcherReturning(() => {
        throw new Error("must not dispatch")
      }),
      signJob,
    })

    const result = await executor.execute(makeRequest("local", { action: renderAction }))
    expect(result.error?.code).toBe("DEVICE_OFFLINE")
  })

  test("DENIED: online but incapable device -> CAPABILITY_UNAVAILABLE", async () => {
    const dispatcher = dispatcherReturning(() => {
      throw new Error("must not dispatch")
    })
    const executor = createLocalExecutor({
      devices: fakeDevices([makeDevice({ capabilities: ["blender:scene.info"] })]),
      dispatcher,
      signJob,
    })

    const result = await executor.execute(makeRequest("local", { action: renderAction }))

    expect(result.status).toBe("error")
    expect(result.error?.code).toBe("CAPABILITY_UNAVAILABLE")
    expect(dispatcher.jobs).toHaveLength(0)
  })

  test("DENIED: another user's device is never a candidate", async () => {
    const executor = createLocalExecutor({
      devices: fakeDevices([makeDevice({ userId: "user_2", capabilities: [RENDER] })]),
      dispatcher: dispatcherReturning(() => {
        throw new Error("must not dispatch")
      }),
      signJob,
    })

    const result = await executor.execute(makeRequest("local", { action: renderAction }))
    expect(result.error?.code).toBe("DEVICE_OFFLINE")
  })

  test("the agent's error code survives into the ExecutionResult", async () => {
    const executor = createLocalExecutor({
      devices: fakeDevices([capableDevice]),
      dispatcher: dispatcherReturning((job) => ({
        jobId: job.payload.id,
        status: "error",
        error: { code: "INVALID_INPUT", message: "camera not found in /home/user/scene.blend" },
        timingMs: 3,
      })),
      signJob,
    })

    const result = await executor.execute(makeRequest("local", { action: renderAction }))

    expect(result.status).toBe("error")
    expect(result.error?.code).toBe("INVALID_INPUT")
    expect(result.error?.message).toBe("camera not found in scene.blend")
  })

  test("DENIED: an unknown agent error code degrades to UPSTREAM_ERROR", async () => {
    const executor = createLocalExecutor({
      devices: fakeDevices([capableDevice]),
      dispatcher: dispatcherReturning((job) => ({
        jobId: job.payload.id,
        status: "error",
        error: { code: "MADE_UP" as never, message: "" },
        timingMs: 1,
      })),
      signJob,
    })

    const result = await executor.execute(makeRequest("local", { action: renderAction }))
    expect(result.error?.code).toBe("UPSTREAM_ERROR")
  })

  test("a relay failure becomes UPSTREAM_ERROR with a generic message", async () => {
    const executor = createLocalExecutor({
      devices: fakeDevices([capableDevice]),
      dispatcher: {
        async dispatch() {
          throw new Error("relay socket closed for dev_1 at /var/run/cg.sock")
        },
      },
      signJob,
    })

    const result = await executor.execute(makeRequest("local", { action: renderAction }))

    expect(result.error?.code).toBe("UPSTREAM_ERROR")
    expect(result.error?.message).not.toContain("/var/run")
  })

  test("a relay timeout becomes TIMEOUT", async () => {
    const timeout = new Error("timed out")
    timeout.name = "TimeoutError"
    const executor = createLocalExecutor({
      devices: fakeDevices([capableDevice]),
      dispatcher: {
        async dispatch() {
          throw timeout
        },
      },
      signJob,
    })

    const result = await executor.execute(makeRequest("local", { action: renderAction }))
    expect(result.error?.code).toBe("TIMEOUT")
  })

  test("DENIED: a result for a different job id is rejected", async () => {
    const executor = createLocalExecutor({
      devices: fakeDevices([capableDevice]),
      dispatcher: dispatcherReturning(() => ({
        jobId: "job_someone_else",
        status: "success",
        output: { stolen: true },
        timingMs: 1,
      })),
      signJob,
    })

    const result = await executor.execute(makeRequest("local", { action: renderAction }))

    expect(result.status).toBe("error")
    expect(result.error?.code).toBe("INTERNAL")
  })

  test("pins the request's device and scrubs returned file paths", async () => {
    const dispatcher = dispatcherReturning((job) => ({
      jobId: job.payload.id,
      status: "success",
      output: null,
      files: [
        {
          name: "C:\\Users\\user\\renders\\frame.png",
          mimeType: "image/png",
          sizeBytes: 2048,
          ref: "file_1",
        },
      ],
      timingMs: 5,
    }))
    const executor = createLocalExecutor({
      devices: fakeDevices([
        makeDevice({ id: "dev_other", capabilities: [RENDER] }),
        makeDevice({ id: "dev_target", capabilities: [RENDER] }),
      ]),
      dispatcher,
      signJob,
    })

    const result = await executor.execute(
      makeRequest("local", { action: renderAction, deviceId: "dev_target" }),
    )

    expect(dispatcher.deviceIds).toEqual(["dev_target"])
    expect(result.files?.[0]?.name).toBe("frame.png")
    expect(JSON.stringify(result)).not.toContain("Users")
  })

  test("DENIED: a revoked pinned device -> DEVICE_REVOKED", async () => {
    const executor = createLocalExecutor({
      devices: fakeDevices([makeDevice({ status: "revoked", capabilities: [RENDER] })]),
      dispatcher: dispatcherReturning(() => {
        throw new Error("must not dispatch")
      }),
      signJob,
    })

    const result = await executor.execute(
      makeRequest("local", { action: renderAction, deviceId: "dev_1" }),
    )
    expect(result.error?.code).toBe("DEVICE_REVOKED")
  })
})
