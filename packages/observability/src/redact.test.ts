import { describe, expect, test } from "bun:test"
import { REDACTED, isSensitiveKey, redact, redactText } from "./redact"

describe("redact / secrets", () => {
  test("replaces the value of every sensitive key, whatever its type", () => {
    const out = redact({
      accessToken: "sk-live-123",
      refresh_token: "rt-456",
      apiKey: "ak-789",
      "api-key": "ak-789",
      authorization: "Bearer abc.def",
      password: "hunter2",
      clientSecret: "cs-1",
      credential: { nested: "still gone" },
      cookie: ["a=1"],
      keep: "visible",
    }) as Record<string, unknown>

    for (const key of Object.keys(out)) {
      if (key === "keep") continue
      expect(out[key]).toBe(REDACTED)
    }
    expect(out.keep).toBe("visible")
    expect(JSON.stringify(out)).not.toContain("sk-live-123")
    expect(JSON.stringify(out)).not.toContain("hunter2")
  })

  test("matches sensitive keys case-insensitively and inside compound names", () => {
    expect(isSensitiveKey("deviceCredential")).toBe(true)
    expect(isSensitiveKey("X-API-KEY")).toBe(true)
    expect(isSensitiveKey("bearerToken")).toBe(true)
    expect(isSensitiveKey("connectorId")).toBe(false)
  })

  test("scrubs bearer values that arrive as free text", () => {
    expect(redactText("Authorization: Bearer eyJhbGciOi.payload.sig")).toBe(
      `Authorization: Bearer ${REDACTED}`,
    )
  })
})

describe("redact / structure", () => {
  test("walks nested objects and arrays", () => {
    const out = redact({
      request: { id: "req_1", headers: { authorization: "Bearer x" } },
      items: [{ token: "t1" }, { name: "ok" }, ["deep", { secret: "s" }]],
    })

    expect(out).toEqual({
      request: { id: "req_1", headers: { authorization: REDACTED } },
      items: [{ token: REDACTED }, { name: "ok" }, ["deep", { secret: REDACTED }]],
    })
  })

  test("does not mutate the input", () => {
    const input = { token: "t", nested: { path: "/home/u/a.txt" } }
    redact(input)
    expect(input.token).toBe("t")
    expect(input.nested.path).toBe("/home/u/a.txt")
  })

  test("is cycle-safe", () => {
    const node: Record<string, unknown> = { name: "root" }
    node.self = node
    node.children = [{ parent: node }]

    const out = redact(node) as Record<string, unknown>
    expect(out.self).toBe("[circular]")
    expect((out.children as Array<Record<string, unknown>>)[0]?.parent).toBe("[circular]")
    expect(JSON.stringify(out)).toBeTruthy()
  })

  test("treats a repeated sibling reference as data, not a cycle", () => {
    const shared = { name: "shared" }
    const out = redact({ a: shared, b: shared })
    expect(out).toEqual({ a: { name: "shared" }, b: { name: "shared" } })
  })

  test("is depth-bounded", () => {
    let deep: Record<string, unknown> = { leaf: true }
    for (let i = 0; i < 40; i += 1) deep = { next: deep }

    const serialized = JSON.stringify(redact(deep))
    expect(serialized).toContain("[truncated]")
    expect(serialized).not.toContain("leaf")
  })

  test("normalizes non-JSON values instead of throwing", () => {
    const out = redact({
      when: new Date(0),
      big: 10n,
      fn: () => undefined,
      err: new Error("failed reading /home/u/secret.txt"),
      nothing: null,
    }) as Record<string, unknown>

    expect(out.when).toBe("1970-01-01T00:00:00.000Z")
    expect(out.big).toBe("10")
    expect(out.fn).toBe("[function]")
    expect(out.err).toEqual({ name: "Error", message: "failed reading secret.txt" })
    expect(out.nothing).toBeNull()
  })
})

describe("redact / paths", () => {
  test("reduces POSIX absolute paths to a basename", () => {
    expect(redact({ file: "/home/user/renders/frame.png" })).toEqual({ file: "frame.png" })
    expect(redactText("wrote /var/lib/cg/out.blend ok")).toBe("wrote out.blend ok")
  })

  test("reduces Windows absolute paths to a basename", () => {
    expect(redact({ file: "C:\\Users\\user\\Documents\\out.png" })).toEqual({ file: "out.png" })
    expect(redactText('opened "D:\\work\\scene.blend"')).toBe('opened "scene.blend"')
  })

  test("leaves URLs and relative ids intact", () => {
    expect(redactText("https://api.example.com/v1/applications")).toBe(
      "https://api.example.com/v1/applications",
    )
    expect(redactText("blender.scene.render")).toBe("blender.scene.render")
    expect(redactText("req_abc123")).toBe("req_abc123")
  })
})
