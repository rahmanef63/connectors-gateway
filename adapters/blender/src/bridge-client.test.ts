import { afterEach, describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { BridgeClient, assertLoopback } from "./bridge-client"

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
  globalThis.fetch = ((input: unknown, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init))) as unknown as typeof fetch
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function reason(fn: () => unknown): GatewayError {
  try {
    fn()
  } catch (error) {
    if (error instanceof GatewayError) return error
    throw error
  }
  throw new Error("expected a GatewayError")
}

describe("assertLoopback — denied", () => {
  const denied = [
    "http://evil.com",
    "http://192.168.1.5",
    "http://0.0.0.0",
    "http://0.0.0.0:8787/health",
    "http://10.0.0.1:8787",
    "http://127.0.0.1.evil.com",
    "http://localhost.evil.com",
    "http://127.0.0.1@evil.com",
    "ftp://127.0.0.1",
    "file:///etc/passwd",
    "not a url",
    "",
  ]

  for (const url of denied) {
    test(`rejects ${url || "(empty)"}`, () => {
      const error = reason(() => assertLoopback(url))
      expect(error.code).toBe("NOT_AUTHORIZED")
      expect(error.message).toBe("Blender bridge must be loopback.")
    })
  }
})

describe("assertLoopback — allowed", () => {
  const allowed = [
    "http://127.0.0.1:8787",
    "http://127.0.0.1:8787/health",
    "http://localhost:8787",
    "http://LOCALHOST:8787",
    "http://[::1]:8787",
    "https://127.0.0.1:8787",
  ]

  for (const url of allowed) {
    test(`accepts ${url}`, () => {
      expect(assertLoopback(url)).toBeInstanceOf(URL)
    })
  }
})

describe("BridgeClient", () => {
  test("constructor rejects a non-loopback bridge", () => {
    expect(reason(() => new BridgeClient("http://192.168.1.5:8787")).code).toBe("NOT_AUTHORIZED")
  })

  test("posts JSON to the loopback endpoint and returns the parsed object", async () => {
    let seenUrl = ""
    let seenBody = ""
    stubFetch((url, init) => {
      seenUrl = url
      seenBody = String(init?.body ?? "")
      return jsonResponse({ ok: true })
    })

    const client = new BridgeClient("http://127.0.0.1:8787")
    const result = await client.post("/scene/inspect", { includeObjects: true })

    expect(seenUrl).toBe("http://127.0.0.1:8787/scene/inspect")
    expect(JSON.parse(seenBody)).toEqual({ includeObjects: true })
    expect(result).toEqual({ ok: true })
  })

  test("an unreachable bridge becomes CAPABILITY_UNAVAILABLE, not a raw network error", async () => {
    stubFetch(() => {
      throw new TypeError("connect ECONNREFUSED 127.0.0.1:8787")
    })
    const client = new BridgeClient("http://127.0.0.1:8787")
    await expect(client.get("/health")).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" })
  })

  test("a non-2xx answer surfaces only the status", async () => {
    stubFetch(() => new Response("/home/artist/secret.blend not found", { status: 500 }))
    const client = new BridgeClient("http://127.0.0.1:8787")
    const error = await client.post("/scene/render", {}).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).code).toBe("UPSTREAM_ERROR")
    expect((error as GatewayError).message).not.toContain("/home/artist")
  })

  test("a non-object or malformed body is refused", async () => {
    stubFetch(() => jsonResponse([1, 2, 3]))
    const client = new BridgeClient("http://127.0.0.1:8787")
    await expect(client.get("/health")).rejects.toMatchObject({ code: "UPSTREAM_ERROR" })

    stubFetch(() => new Response("<html>nope</html>", { status: 200 }))
    await expect(client.get("/health")).rejects.toMatchObject({ code: "UPSTREAM_ERROR" })
  })

  test("a relative path cannot escape the loopback origin", async () => {
    stubFetch(() => jsonResponse({}))
    const client = new BridgeClient("http://127.0.0.1:8787")
    await expect(client.get("//evil.com/health")).rejects.toMatchObject({ code: "NOT_AUTHORIZED" })
  })

  test("a caller abort surfaces as CANCELLED", async () => {
    stubFetch(() => {
      const error = new Error("aborted")
      error.name = "AbortError"
      throw error
    })
    const client = new BridgeClient("http://127.0.0.1:8787")
    await expect(client.get("/health")).rejects.toMatchObject({ code: "CANCELLED" })
  })
})
