import { describe, expect, test } from "bun:test"
import { MAX_BODY_BYTES, readJsonBody } from "./body"

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  })
}

describe("readJsonBody", () => {
  test("parses a JSON object", async () => {
    expect(await readJsonBody(request('{"a":1}'))).toEqual({ a: 1 })
  })

  test("an empty body is an empty object", async () => {
    expect(await readJsonBody(request(""))).toEqual({})
  })

  test("a charset parameter is tolerated", async () => {
    const value = await readJsonBody(
      request('{"a":1}', { "content-type": "application/json; charset=utf-8" }),
    )
    expect(value).toEqual({ a: 1 })
  })

  test("a non-JSON content type is refused", async () => {
    await expect(readJsonBody(request("{}", { "content-type": "text/plain" }))).rejects.toThrow()
  })

  test("an array or scalar body is refused", async () => {
    await expect(readJsonBody(request("[1,2]"))).rejects.toThrow()
    await expect(readJsonBody(request('"hello"'))).rejects.toThrow()
  })

  test("malformed JSON is refused and never echoed", async () => {
    try {
      await readJsonBody(request('{"token":"sk-live-secret"'))
      throw new Error("expected a throw")
    } catch (error) {
      expect((error as Error).message).not.toContain("sk-live")
    }
  })

  test("an oversized body is refused before parsing", async () => {
    const huge = JSON.stringify({ blob: "x".repeat(MAX_BODY_BYTES + 10) })
    await expect(readJsonBody(request(huge))).rejects.toThrow("too large")
  })

  test("a lying content-length header still hits the real cap", async () => {
    const huge = JSON.stringify({ blob: "x".repeat(MAX_BODY_BYTES + 10) })
    await expect(readJsonBody(request(huge, { "content-length": "5" }))).rejects.toThrow("too large")
  })
})
