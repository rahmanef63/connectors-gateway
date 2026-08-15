import { describe, expect, test } from "bun:test"
import { createJobEnvelope } from "@cg/protocol"
import type { AgentResult, SignedJob } from "@cg/protocol"
import { GatewayError } from "@cg/core"
import { silentLogger } from "../__tests__/fixtures"
import { createDispatcher } from "./dispatch"
import { createSocketRegistry } from "./sockets"
import { newSocketState } from "./types"
import type { RelaySocket } from "./types"

function fakeSocket(sent: string[] = []): { socket: RelaySocket; sent: string[] } {
  const socket = {
    data: newSocketState("sock_1", 0),
    send: (data: string) => {
      sent.push(data)
      return data.length
    },
    close: () => {},
  } as unknown as RelaySocket
  return { socket, sent }
}

function job(): SignedJob {
  return {
    payload: createJobEnvelope({
      connector: "testlocal",
      action: "testlocal.render",
      input: {},
      requestContext: { requestId: "req_1", userId: "usr_1" },
    }),
    signature: "c2ln",
    keyId: "k1",
  }
}

function setup(deviceId = "dev_1") {
  const sockets = createSocketRegistry()
  const { socket, sent } = fakeSocket()
  sockets.set(deviceId, socket)
  return { sockets, socket, sent, dispatcher: createDispatcher({ sockets, logger: silentLogger }) }
}

function successResult(jobId: string): AgentResult {
  return { jobId, status: "success", output: { ok: true }, timingMs: 5 }
}

describe("createDispatcher", () => {
  test("an unconnected device fails fast with DEVICE_OFFLINE", async () => {
    const { dispatcher } = setup()
    await expect(dispatcher.dispatch("dev_missing", job(), 50)).rejects.toMatchObject({
      code: "DEVICE_OFFLINE",
    })
    expect(dispatcher.pendingCount()).toBe(0)
  })

  test("sends a job frame and resolves on the matching result", async () => {
    const { dispatcher, sent } = setup()
    const signed = job()
    const pending = dispatcher.dispatch("dev_1", signed, 1_000)
    expect(dispatcher.pendingCount()).toBe(1)

    const frame = JSON.parse(sent[0] ?? "{}")
    expect(frame.type).toBe("job")
    expect(frame.job.payload.id).toBe(signed.payload.id)

    dispatcher.settle("dev_1", successResult(signed.payload.id))
    await expect(pending).resolves.toMatchObject({ status: "success" })
    expect(dispatcher.pendingCount()).toBe(0)
  })

  test("times out, cleans up the pending map and sends a cancel frame", async () => {
    const { dispatcher, sent } = setup()
    const signed = job()
    const pending = dispatcher.dispatch("dev_1", signed, 5)

    await expect(pending).rejects.toMatchObject({ code: "TIMEOUT" })
    expect(dispatcher.pendingCount()).toBe(0)

    const cancel = JSON.parse(sent[1] ?? "{}")
    expect(cancel.type).toBe("cancel")
    expect(cancel.jobId).toBe(signed.payload.id)
  })

  test("a late result after a timeout is dropped, not resolved", async () => {
    const { dispatcher } = setup()
    const signed = job()
    const pending = dispatcher.dispatch("dev_1", signed, 5)
    await expect(pending).rejects.toMatchObject({ code: "TIMEOUT" })

    expect(dispatcher.settle("dev_1", successResult(signed.payload.id))).toBe(false)
  })

  test("a result for an unknown job id is dropped", async () => {
    const { dispatcher } = setup()
    expect(dispatcher.settle("dev_1", successResult("job_unknown"))).toBe(false)
  })

  test("a FOREIGN device cannot answer another device's job", async () => {
    const sockets = createSocketRegistry()
    sockets.set("dev_1", fakeSocket().socket)
    sockets.set("dev_2", fakeSocket().socket)
    const dispatcher = createDispatcher({ sockets, logger: silentLogger })

    const signed = job()
    const pending = dispatcher.dispatch("dev_1", signed, 1_000)

    // dev_2 answers dev_1's job id.
    expect(dispatcher.settle("dev_2", successResult(signed.payload.id))).toBe(false)
    expect(dispatcher.pendingCount()).toBe(1)

    dispatcher.settle("dev_1", successResult(signed.payload.id))
    await expect(pending).resolves.toMatchObject({ status: "success" })
  })

  test("the same job id cannot be in flight twice", async () => {
    const { dispatcher } = setup()
    const signed = job()
    const first = dispatcher.dispatch("dev_1", signed, 1_000)
    await expect(dispatcher.dispatch("dev_1", signed, 1_000)).rejects.toMatchObject({
      code: "REPLAY_DETECTED",
    })
    dispatcher.settle("dev_1", successResult(signed.payload.id))
    await first
  })

  test("failDevice rejects everything waiting on that device only", async () => {
    const sockets = createSocketRegistry()
    sockets.set("dev_1", fakeSocket().socket)
    sockets.set("dev_2", fakeSocket().socket)
    const dispatcher = createDispatcher({ sockets, logger: silentLogger })

    const a = dispatcher.dispatch("dev_1", job(), 1_000)
    const b = dispatcher.dispatch("dev_2", job(), 1_000)
    const failed = dispatcher.failDevice(
      "dev_1",
      new GatewayError("DEVICE_OFFLINE", "The device disconnected."),
    )

    expect(failed).toBe(1)
    await expect(a).rejects.toMatchObject({ code: "DEVICE_OFFLINE" })
    expect(dispatcher.pendingCount()).toBe(1)
    dispatcher.failDevice("dev_2", new GatewayError("DEVICE_OFFLINE", "gone"))
    await expect(b).rejects.toMatchObject({ code: "DEVICE_OFFLINE" })
  })

  test("a send failure cleans up instead of leaking a pending entry", async () => {
    const sockets = createSocketRegistry()
    const socket = {
      data: newSocketState("sock_x", 0),
      send: () => {
        throw new Error("socket closed")
      },
      close: () => {},
    } as unknown as RelaySocket
    sockets.set("dev_1", socket)
    const dispatcher = createDispatcher({ sockets, logger: silentLogger })

    await expect(dispatcher.dispatch("dev_1", job(), 1_000)).rejects.toMatchObject({
      code: "DEVICE_OFFLINE",
    })
    expect(dispatcher.pendingCount()).toBe(0)
  })
})
