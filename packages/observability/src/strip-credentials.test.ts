/**
 * `stripCredentials` is the narrow one: it exists to be usable on data a caller
 * ASKED FOR, so most of these tests assert what it leaves ALONE. A redactor that
 * mangles legitimate output is not a safer product, it is a broken one.
 */
import { describe, expect, test } from "bun:test"
import { REDACTED, redact, stripCredentials, stripCredentialsDeep } from "./redact"

const KEY = `cgk_key_${"a".repeat(32)}_${"b".repeat(64)}`
const DEVICE = `cgd_dev_${"c".repeat(16)}_${"d".repeat(32)}`

describe("stripCredentials", () => {
  test("removes a gateway credential embedded in free text", () => {
    // The real case: an upstream 401 body quoting the header it was sent.
    const body = `{"error":"invalid token","received":"${KEY}"}`
    const out = stripCredentials(body)
    expect(out).not.toContain(KEY)
    expect(out).toContain(REDACTED)
  })

  test("removes a device credential too, not just an API key", () => {
    expect(stripCredentials(`hello ${DEVICE}`)).not.toContain(DEVICE)
  })

  test("leaves a key-shaped VALUE that is not our grammar", () => {
    // A connector returning someone else's token is that connector's business.
    // Blanking it would break, for instance, a tool that mints an upstream key.
    const other = "sk-proj-abc123def456"
    expect(stripCredentials(`key=${other}`)).toBe(`key=${other}`)
  })

  test("leaves an absolute path intact, unlike the log redactor", () => {
    // `fs_read` answering with a path is the answer. `redact` strips paths
    // because a log does not need them; a tool result does.
    const text = "/home/user/projects/app/config.yaml"
    expect(stripCredentials(text)).toBe(text)
    expect(redact(text)).not.toBe(text)
  })

  test("leaves a line the user explicitly asked to read", () => {
    // The whole reason this is not `redact`: a config file containing the word
    // `api_key` is legitimate content when a tool was told to read that file.
    const file = "api_key = my-service-key\npassword = hunter2"
    expect(stripCredentials(file)).toBe(file)
  })
})

describe("stripCredentialsDeep", () => {
  test("reaches nested strings and preserves the shape", () => {
    const out = stripCredentialsDeep({
      status: 401,
      body: { detail: `bad ${KEY}`, retries: [1, 2] },
      items: [{ note: KEY }],
    }) as Record<string, unknown>

    expect(JSON.stringify(out)).not.toContain(KEY)
    expect(out.status).toBe(401)
    expect((out.body as { retries: number[] }).retries).toEqual([1, 2])
    expect(Array.isArray(out.items)).toBe(true)
  })

  test("does not blank fields by NAME, however sensitive the name looks", () => {
    // `redact` blanks these; this must not. That difference is the whole point.
    const input = { token: "a-real-value-the-caller-wanted", password: "also-wanted" }
    expect(stripCredentialsDeep(input)).toEqual(input)
    expect((redact(input) as Record<string, unknown>).token).toBe(REDACTED)
  })

  test("survives a cycle without hanging or losing data", () => {
    const node: Record<string, unknown> = { name: "root", secret: KEY }
    node.self = node
    const out = stripCredentialsDeep(node) as Record<string, unknown>
    expect(out.name).toBe("root")
    expect(out.secret).toBe(REDACTED)
  })

  test("passes non-string leaves through untouched", () => {
    const input = { n: 1, b: true, nil: null, u: undefined }
    expect(stripCredentialsDeep(input)).toEqual(input)
  })

  test("beyond the depth cap it returns the value rather than dropping it", () => {
    // Losing a caller's data is a worse failure than not stripping at a depth
    // no real connector reaches — so the cap degrades to a no-op, not to a
    // `[truncated]` marker the way the log path does.
    let deep: unknown = "leaf"
    for (let i = 0; i < 30; i += 1) deep = { next: deep }
    expect(JSON.stringify(stripCredentialsDeep(deep))).toContain("leaf")
  })
})
