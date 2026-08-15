import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { ResultFile } from "@cg/core"
import { errorResult, redactPaths, sanitizeFiles, successResult } from "./job-result"

describe("successResult", () => {
  test("carries the adapter output and a rounded timing", () => {
    const result = successResult("job_1", { output: { frames: 3 } }, 12.7)
    expect(result).toEqual({ jobId: "job_1", status: "success", output: { frames: 3 }, timingMs: 13 })
    expect(result.files).toBeUndefined()
  })

  test("a negative or non-finite timing collapses to 0", () => {
    expect(successResult("job_1", { output: null }, -5).timingMs).toBe(0)
    expect(successResult("job_1", { output: null }, Number.NaN).timingMs).toBe(0)
  })
})

describe("errorResult", () => {
  test("keeps a GatewayError's code and message", () => {
    const result = errorResult("job_1", new GatewayError("TIMEOUT", "The local action timed out."), 5)
    expect(result).toEqual({
      jobId: "job_1",
      status: "error",
      error: { code: "TIMEOUT", message: "The local action timed out." },
      timingMs: 5,
    })
  })

  test("an unknown throwable becomes INTERNAL with no internal detail", () => {
    const result = errorResult("job_1", new Error("connect ECONNREFUSED 127.0.0.1:9876"), 1)
    expect(result.error?.code).toBe("INTERNAL")
    expect(result.error?.message).not.toContain("ECONNREFUSED")
  })
})

describe("redactPaths", () => {
  test("strips absolute posix, windows and UNC paths", () => {
    expect(redactPaths("cannot read /home/operator/.ssh/id_ed25519")).not.toContain("/home/operator")
    expect(redactPaths("cannot read C:\\Users\\rahman\\secret.blend")).not.toContain("Users")
    expect(redactPaths("cannot read \\\\nas\\share\\scene.blend")).not.toContain("nas")
  })

  test("leaves an ordinary message alone and caps its length", () => {
    expect(redactPaths("Blender is not running.")).toBe("Blender is not running.")
    expect(redactPaths("x".repeat(1000)).length).toBe(300)
  })
})

describe("sanitizeFiles", () => {
  test("reduces every name to a bare basename", () => {
    const files = [{ name: "/tmp/renders/frame.png", mimeType: "image/png", sizeBytes: 10, ref: "ref_1" }]
    expect(sanitizeFiles(files)).toEqual([
      { name: "frame.png", mimeType: "image/png", sizeBytes: 10, ref: "ref_1" },
    ])
  })

  test("DENIED: entries that are not describable files are dropped", () => {
    const files = [
      { name: "..", mimeType: "image/png", sizeBytes: 1, ref: "r" },
      { name: "ok.png", mimeType: 7, sizeBytes: 1, ref: "r" },
      { name: 5, mimeType: "image/png", sizeBytes: 1, ref: "r" },
      null,
    ] as unknown as ResultFile[]
    expect(sanitizeFiles(files)).toEqual([])
  })

  test("a non-array is empty, and sizes are normalized", () => {
    expect(sanitizeFiles(undefined)).toEqual([])
    const [file] = sanitizeFiles([
      { name: "a.png", mimeType: "image/png", sizeBytes: -3, ref: "r" },
    ])
    expect(file?.sizeBytes).toBe(0)
  })
})
