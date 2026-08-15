import { describe, expect, test } from "bun:test"
import { REDACTED } from "./redact"
import { createLogger } from "./logger"

function collector(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = []
  return { lines, write: (line) => void lines.push(line) }
}

describe("createLogger", () => {
  test("emits exactly one JSON line per call, carrying scope and level", () => {
    const sink = collector()
    const log = createLogger("executor.cloud", { write: sink.write, now: () => 0 })

    log.info("dispatched")
    log.warn("slow")
    log.error("failed")

    expect(sink.lines).toHaveLength(3)
    for (const line of sink.lines) expect(line).not.toContain("\n")

    const first = JSON.parse(sink.lines[0] ?? "{}")
    expect(first).toMatchObject({
      level: "info",
      scope: "executor.cloud",
      message: "dispatched",
      time: "1970-01-01T00:00:00.000Z",
    })
    expect(JSON.parse(sink.lines[1] ?? "{}").level).toBe("warn")
    expect(JSON.parse(sink.lines[2] ?? "{}").level).toBe("error")
  })

  test("carries requestId and any extra field", () => {
    const sink = collector()
    createLogger("gateway").child({ requestId: "req_1" })
    const log = createLogger("gateway", { write: sink.write })

    log.info("routing", { requestId: "req_1", connectorId: "blender" })

    expect(JSON.parse(sink.lines[0] ?? "{}")).toMatchObject({
      requestId: "req_1",
      connectorId: "blender",
    })
  })

  test("child loggers inherit base fields and do not mutate the parent", () => {
    const sink = collector()
    const parent = createLogger("gateway", { write: sink.write })
    const child = parent.child({ requestId: "req_9" })

    child.info("with context")
    parent.info("without context")

    expect(JSON.parse(sink.lines[0] ?? "{}").requestId).toBe("req_9")
    expect(JSON.parse(sink.lines[1] ?? "{}").requestId).toBeUndefined()
  })

  test("DENIED: never writes a token, a credential, or an absolute path", () => {
    const sink = collector()
    const log = createLogger("executor.cloud", { write: sink.write })

    log.error("upstream rejected", {
      requestId: "req_2",
      credential: { token: "sk-live-supersecret" },
      authorization: "Bearer sk-live-supersecret",
      outputPath: "/home/user/renders/frame.png",
    })

    const line = sink.lines[0] ?? ""
    expect(line).not.toContain("sk-live-supersecret")
    expect(line).not.toContain("/home/user")
    const record = JSON.parse(line)
    expect(record.credential).toBe(REDACTED)
    expect(record.authorization).toBe(REDACTED)
    expect(record.outputPath).toBe("frame.png")
  })

  test("survives a circular field instead of throwing at the call site", () => {
    const sink = collector()
    const log = createLogger("gateway", { write: sink.write })
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(() => log.info("cyclic", { cyclic })).not.toThrow()
    expect(JSON.parse(sink.lines[0] ?? "{}").cyclic).toEqual({ self: "[circular]" })
  })

  test("defaults to stderr, never stdout", () => {
    const log = createLogger("gateway")
    const written: string[] = []
    const original = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: string) => {
      written.push(String(chunk))
      return true
    }
    try {
      log.info("to stderr")
    } finally {
      process.stderr.write = original
    }
    expect(written).toHaveLength(1)
    expect(written[0]?.endsWith("\n")).toBe(true)
    expect(JSON.parse(written[0] ?? "{}").message).toBe("to stderr")
  })
})
