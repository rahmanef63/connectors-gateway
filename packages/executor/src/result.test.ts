import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import {
  errorResult,
  isErrorCode,
  normalizeAdapterOutput,
  normalizeFiles,
  successResult,
} from "./result"

const file = {
  name: "/home/user/renders/frame.png",
  mimeType: "image/png",
  sizeBytes: 1024,
  ref: "file_1",
}

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (cause) {
    return cause instanceof GatewayError ? cause.code : "NOT_A_GATEWAY_ERROR"
  }
  return "NO_THROW"
}

describe("successResult / errorResult", () => {
  test("omits an empty files array", () => {
    expect(successResult({ ok: true }, [], 3)).toEqual({
      status: "success",
      output: { ok: true },
      timingMs: 3,
    })
  })

  test("carries the closed-vocabulary code", () => {
    expect(errorResult("TIMEOUT", "The action timed out.", 7)).toEqual({
      status: "error",
      error: { code: "TIMEOUT", message: "The action timed out." },
      timingMs: 7,
    })
  })
})

describe("isErrorCode", () => {
  test("accepts only the shared vocabulary", () => {
    expect(isErrorCode("CAPABILITY_UNAVAILABLE")).toBe(true)
    expect(isErrorCode("MADE_UP")).toBe(false)
    expect(isErrorCode(42)).toBe(false)
  })
})

describe("normalizeFiles", () => {
  const malformed = new GatewayError("UPSTREAM_ERROR", "malformed")

  test("scrubs absolute paths out of names and refs", () => {
    const files = normalizeFiles([file], malformed)
    expect(files?.[0]?.name).toBe("frame.png")
    expect(files?.[0]?.ref).toBe("file_1")
  })

  test("keeps expiresAt when present", () => {
    const files = normalizeFiles([{ ...file, expiresAt: 99 }], malformed)
    expect(files?.[0]?.expiresAt).toBe(99)
  })

  test("DENIED: a non-array or a malformed entry throws", () => {
    expect(codeOf(() => normalizeFiles("nope", malformed))).toBe("UPSTREAM_ERROR")
    expect(codeOf(() => normalizeFiles([{ name: "a.png" }], malformed))).toBe("UPSTREAM_ERROR")
    expect(codeOf(() => normalizeFiles([{ ...file, sizeBytes: -1 }], malformed))).toBe(
      "UPSTREAM_ERROR",
    )
  })

  test("undefined stays undefined", () => {
    expect(normalizeFiles(undefined, malformed)).toBeUndefined()
  })
})

describe("normalizeAdapterOutput", () => {
  test("passes an output through and scrubs its files", () => {
    expect(normalizeAdapterOutput({ output: { id: 1 }, files: [file] })).toEqual({
      output: { id: 1 },
      files: [{ name: "frame.png", mimeType: "image/png", sizeBytes: 1024, ref: "file_1" }],
    })
  })

  test("drops any extra key the adapter invented", () => {
    const out = normalizeAdapterOutput({ output: 1, token: "sk-live-1" }) as Record<string, unknown>
    expect(Object.keys(out)).toEqual(["output"])
  })

  test("DENIED: a non-object response -> UPSTREAM_ERROR", () => {
    expect(codeOf(() => normalizeAdapterOutput("nope"))).toBe("UPSTREAM_ERROR")
    expect(codeOf(() => normalizeAdapterOutput(null))).toBe("UPSTREAM_ERROR")
  })
})
