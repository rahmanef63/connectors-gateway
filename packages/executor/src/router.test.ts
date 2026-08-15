import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { ExecutionResult, Executor } from "@cg/core"
import { createRouter } from "./router"
import { makeManifest, makeRequest } from "./__tests__/fixtures"

function labelled(label: string): Executor & { calls: number } {
  return {
    calls: 0,
    async execute(): Promise<ExecutionResult> {
      this.calls += 1
      return { status: "success", output: label, timingMs: 0 }
    },
  }
}

describe("createRouter", () => {
  test("routes by the manifest's executor kind", () => {
    const cloud = labelled("cloud")
    const local = labelled("local")
    const router = createRouter({ cloud, local })

    expect(router.route(makeManifest("cloud"))).toBe(cloud)
    expect(router.route(makeManifest("local"))).toBe(local)
  })

  test("execute delegates to the routed executor, so callers never branch", async () => {
    const cloud = labelled("cloud")
    const local = labelled("local")
    const router = createRouter({ cloud, local })

    expect((await router.execute(makeRequest("local"))).output).toBe("local")
    expect((await router.execute(makeRequest("cloud"))).output).toBe("cloud")
    expect(cloud.calls).toBe(1)
    expect(local.calls).toBe(1)
  })

  test("DENIED: an unknown executor kind is rejected, not defaulted", () => {
    const router = createRouter({ cloud: labelled("cloud"), local: labelled("local") })
    const manifest = makeManifest("cloud")
    const rogue = { ...manifest, executor: "shell" as never }

    expect(() => router.route(rogue)).toThrow(GatewayError)
    try {
      router.route(rogue)
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("CONNECTOR_NOT_FOUND")
    }
  })
})
