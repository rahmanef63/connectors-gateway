import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { postJson } from "./http"
import type { FetchLike } from "./http"

const URL_UNDER_TEST = "http://localhost:8787/v1/pair/start"

function respond(body: string, status = 200): FetchLike {
  return async () => new Response(body, { status })
}

describe("postJson", () => {
  test("posts JSON with an explicit content type and returns the parsed record", async () => {
    let seen: RequestInit | undefined
    const fetchImpl: FetchLike = async (_url, init) => {
      seen = init
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    const body = await postJson(URL_UNDER_TEST, { deviceName: "workstation" }, { fetchImpl })
    expect(body).toEqual({ ok: true })
    expect(seen?.method).toBe("POST")
    expect(String(seen?.body)).toContain("workstation")
  })

  test("DENIED: a non-2xx response surfaces the status and nothing else", async () => {
    const fetchImpl = respond(JSON.stringify({ secret: "sk-live-1234" }), 500)
    try {
      await postJson(URL_UNDER_TEST, {}, { fetchImpl })
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("UPSTREAM_ERROR")
      expect((cause as GatewayError).message).toContain("500")
      expect((cause as GatewayError).message).not.toContain("sk-live")
    }
  })

  test("DENIED: a body that is not a JSON object", async () => {
    await expect(postJson(URL_UNDER_TEST, {}, { fetchImpl: respond("<html>nope</html>") })).rejects.toThrow(
      GatewayError,
    )
    await expect(postJson(URL_UNDER_TEST, {}, { fetchImpl: respond("[1,2,3]") })).rejects.toThrow(GatewayError)
    await expect(postJson(URL_UNDER_TEST, {}, { fetchImpl: respond("null") })).rejects.toThrow(GatewayError)
  })

  test("DENIED: an oversized response", async () => {
    const huge = JSON.stringify({ padding: "x".repeat(100_000) })
    await expect(postJson(URL_UNDER_TEST, {}, { fetchImpl: respond(huge) })).rejects.toThrow(GatewayError)
  })

  test("a transport failure never leaks the cause", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("getaddrinfo ENOTFOUND gateway.internal")
    }
    try {
      await postJson(URL_UNDER_TEST, {}, { fetchImpl })
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("UPSTREAM_ERROR")
      expect((cause as GatewayError).message).not.toContain("gateway.internal")
    }
  })

  test("a timeout is TIMEOUT, not a generic upstream error", async () => {
    const fetchImpl: FetchLike = async () => {
      const error = new Error("timed out")
      error.name = "TimeoutError"
      throw error
    }
    try {
      await postJson(URL_UNDER_TEST, {}, { fetchImpl })
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("TIMEOUT")
    }
  })
})
