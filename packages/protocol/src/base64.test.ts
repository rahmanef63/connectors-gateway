import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { fromBase64, fromBase64Url, toBase64, toBase64Url } from "./base64"

const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 65, 66])

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof GatewayError ? error.code : "NOT_A_GATEWAY_ERROR"
  }
  return "NO_THROW"
}

describe("base64", () => {
  test("round trips every byte value", () => {
    const all = new Uint8Array(256).map((_, index) => index)
    expect([...fromBase64(toBase64(all), "x")]).toEqual([...all])
    expect([...fromBase64Url(toBase64Url(all), "x")]).toEqual([...all])
  })

  test("base64url output is url safe and unpadded", () => {
    const encoded = toBase64Url(bytes)
    expect(encoded.includes("+")).toBe(false)
    expect(encoded.includes("/")).toBe(false)
    expect(encoded.includes("=")).toBe(false)
  })

  test("rejects malformed input without echoing it", () => {
    expect(codeOf(() => fromBase64("", "The key"))).toBe("INVALID_INPUT")
    expect(codeOf(() => fromBase64("abc", "The key"))).toBe("INVALID_INPUT")
    expect(codeOf(() => fromBase64("ab c=", "The key"))).toBe("INVALID_INPUT")
    expect(codeOf(() => fromBase64("ab-_", "The key"))).toBe("INVALID_INPUT")
    expect(codeOf(() => fromBase64Url("", "The signature"))).toBe("INVALID_INPUT")
    expect(codeOf(() => fromBase64Url("a", "The signature"))).toBe("INVALID_INPUT")
    expect(codeOf(() => fromBase64Url("ab+/", "The signature"))).toBe("INVALID_INPUT")
  })

  test("the error message never contains the rejected material", () => {
    try {
      fromBase64("secret material!!", "The signing private key")
      throw new Error("expected a throw")
    } catch (error) {
      expect((error as GatewayError).message.includes("secret")).toBe(false)
    }
  })
})
