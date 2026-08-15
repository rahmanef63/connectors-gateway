import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { isAgentResult, toExecutionResult } from "./agent-result"

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (cause) {
    return cause instanceof GatewayError ? cause.code : "NOT_A_GATEWAY_ERROR"
  }
  return "NO_THROW"
}

describe("isAgentResult", () => {
  test("DENIED: anything that is not the protocol shape", () => {
    expect(isAgentResult({ jobId: "job_1", status: "success", timingMs: 1 })).toBe(true)
    expect(isAgentResult({ jobId: "job_1", status: "weird", timingMs: 1 })).toBe(false)
    expect(isAgentResult({ jobId: "", status: "success", timingMs: 1 })).toBe(false)
    expect(isAgentResult({ jobId: "job_1", status: "success" })).toBe(false)
    expect(isAgentResult(null)).toBe(false)
  })
})

describe("toExecutionResult", () => {
  test("uses the gateway-observed timing, not the agent's self-report", () => {
    const result = toExecutionResult(
      { jobId: "job_1", status: "success", output: { ok: true }, timingMs: 1 },
      "job_1",
      55,
    )
    expect(result.timingMs).toBe(55)
    expect(result.output).toEqual({ ok: true })
  })

  test("preserves a known agent error code and scrubs its message", () => {
    const result = toExecutionResult(
      {
        jobId: "job_1",
        status: "error",
        error: { code: "POLICY_DENIED", message: "blocked /home/user/scene.blend" },
        timingMs: 1,
      },
      "job_1",
      2,
    )
    expect(result.error).toEqual({ code: "POLICY_DENIED", message: "blocked scene.blend" })
  })

  test("caps a long agent message", () => {
    const result = toExecutionResult(
      { jobId: "job_1", status: "error", error: { code: "INTERNAL", message: "x".repeat(900) }, timingMs: 1 },
      "job_1",
      2,
    )
    expect(result.error?.message.length).toBe(300)
  })

  test("falls back to a generic message when the agent sends none", () => {
    const result = toExecutionResult(
      { jobId: "job_1", status: "error", error: null, timingMs: 1 },
      "job_1",
      2,
    )
    expect(result.error?.code).toBe("UPSTREAM_ERROR")
    expect(result.error?.message).toBe("The device could not complete this action.")
  })

  /**
   * Regression: the path regexes ran over the WHOLE message before it was
   * capped, so a 1 MiB `error.message` (the frame limit is the only bound the
   * protocol puts on it) cost the shared gateway ~0.4s of CPU per result frame.
   */
  test("a megabyte error message is capped before the path scrub runs", () => {
    const hostile = "/a".repeat(500_000)
    const startedAt = performance.now()
    const result = toExecutionResult(
      { jobId: "job_1", status: "error", error: { code: "INTERNAL", message: hostile }, timingMs: 1 },
      "job_1",
      2,
    )
    const elapsed = performance.now() - startedAt

    expect(result.error?.message.length).toBeLessThanOrEqual(300)
    // The unfixed version needs hundreds of milliseconds for this input.
    expect(elapsed).toBeLessThan(50)
  })

  test("a path inside the retained window is still scrubbed", () => {
    const result = toExecutionResult(
      {
        jobId: "job_1",
        status: "error",
        error: { code: "INTERNAL", message: "could not write /home/rahman/renders/out.png" },
        timingMs: 1,
      },
      "job_1",
      2,
    )
    expect(result.error?.message).toBe("could not write out.png")
  })

  test("DENIED: a mismatched job id -> INTERNAL", () => {
    expect(
      codeOf(() => toExecutionResult({ jobId: "job_2", status: "success", timingMs: 1 }, "job_1", 2)),
    ).toBe("INTERNAL")
  })

  test("DENIED: a malformed result -> UPSTREAM_ERROR", () => {
    expect(codeOf(() => toExecutionResult({ nope: true }, "job_1", 2))).toBe("UPSTREAM_ERROR")
  })
})
