import { describe, expect, test } from "bun:test"
import { fromBase64Url, toBase64Url, toHex } from "./base64url"

describe("toBase64Url / fromBase64Url", () => {
  test("roundtrips arbitrary bytes, including chunk boundaries", () => {
    for (const length of [0, 1, 2, 3, 16, 32, 255, 0x8000 + 7]) {
      const bytes = new Uint8Array(length)
      crypto.getRandomValues(bytes)
      const encoded = toBase64Url(bytes)
      expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(fromBase64Url(encoded)).toEqual(bytes)
    }
  })

  test("emits url-safe characters and no padding", () => {
    const encoded = toBase64Url(new Uint8Array([251, 255, 190, 255]))
    expect(encoded.includes("+")).toBe(false)
    expect(encoded.includes("/")).toBe(false)
    expect(encoded.includes("=")).toBe(false)
  })

  test("also decodes standard base64 with padding", () => {
    expect(fromBase64Url("/+8=")).toEqual(new Uint8Array([255, 239]))
  })

  test("DENIED: invalid input decodes to null instead of throwing", () => {
    for (const value of ["!!!", "ab cd", "**", null as unknown as string, 7 as unknown as string]) {
      expect(fromBase64Url(value)).toBeNull()
    }
    expect(fromBase64Url("")).toEqual(new Uint8Array(0))
  })
})

describe("toHex", () => {
  test("pads each byte to two lowercase digits", () => {
    expect(toHex(new Uint8Array([0, 15, 16, 255]))).toBe("000f10ff")
    expect(toHex(new Uint8Array())).toBe("")
  })
})
