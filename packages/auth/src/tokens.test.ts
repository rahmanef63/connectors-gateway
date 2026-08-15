import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import {
  TOKEN_PREFIXES,
  formatToken,
  isTokenPrefix,
  newCredentialSecret,
  parseToken,
} from "./tokens"

const SECRET = newCredentialSecret()

describe("newCredentialSecret", () => {
  test("is 256 bits of hex and contains no separator", () => {
    expect(SECRET).toMatch(/^[0-9a-f]{64}$/)
    expect(SECRET.includes("_")).toBe(false)
    expect(newCredentialSecret()).not.toBe(SECRET)
  })
})

describe("formatToken / parseToken", () => {
  test("roundtrips an API key", () => {
    const token = formatToken(TOKEN_PREFIXES.apiKey, "key123", SECRET)
    expect(token).toBe(`cgk_key123_${SECRET}`)
    expect(parseToken(TOKEN_PREFIXES.apiKey, token)).toEqual({ id: "key123", secret: SECRET })
  })

  test("roundtrips a prefixed device id that itself contains an underscore", () => {
    const token = formatToken(TOKEN_PREFIXES.device, "dev_ab12cd34", SECRET)
    expect(parseToken(TOKEN_PREFIXES.device, token)).toEqual({
      id: "dev_ab12cd34",
      secret: SECRET,
    })
  })

  test("DENIED: the wrong prefix never parses", () => {
    const token = formatToken(TOKEN_PREFIXES.device, "dev_ab12", SECRET)
    expect(parseToken(TOKEN_PREFIXES.apiKey, token)).toBeNull()
  })

  test("DENIED: malformed shapes", () => {
    const malformed = [
      "",
      "cgk",
      "cgk_",
      `cgk_${SECRET}`, // only two fields
      `cgk__${SECRET}`, // empty id
      "cgk_key123_",
      "cgk_key123_short",
      `cgk_key123_${SECRET}_extra`, // trailing field: `_` is not in the secret charset
      ` cgk_key123_${SECRET}`,
      `cgk_key123_${SECRET} `,
      `cgk_key123_${SECRET}\n`,
      `CGK_key123_${SECRET}`,
      `cgk_key 123_${SECRET}`,
      `cgk_key123_${SECRET.slice(0, -1)}$`, // illegal character in the secret
      `cgk_-key123_${SECRET}`, // id must start alphanumeric
      `cgk_${"x".repeat(200)}_${SECRET}`,
    ]
    for (const token of malformed) {
      expect(parseToken(TOKEN_PREFIXES.apiKey, token)).toBeNull()
    }
  })

  test("DENIED: non-string token", () => {
    expect(parseToken(TOKEN_PREFIXES.apiKey, undefined as unknown as string)).toBeNull()
    expect(parseToken(TOKEN_PREFIXES.apiKey, {} as unknown as string)).toBeNull()
  })

  test("DENIED: formatting invalid parts throws INVALID_INPUT without echoing them", () => {
    expect(() => formatToken(TOKEN_PREFIXES.apiKey, "bad id", SECRET)).toThrow(GatewayError)
    expect(() => formatToken(TOKEN_PREFIXES.apiKey, "", SECRET)).toThrow(GatewayError)
    expect(() => formatToken(TOKEN_PREFIXES.apiKey, "key123", "tiny")).toThrow(GatewayError)
    expect(() => formatToken("nope" as never, "key123", SECRET)).toThrow(GatewayError)
    try {
      formatToken(TOKEN_PREFIXES.apiKey, "key123", "tiny")
    } catch (error) {
      expect((error as GatewayError).code).toBe("INVALID_INPUT")
      expect((error as GatewayError).message).not.toContain("tiny")
    }
  })
})

describe("isTokenPrefix", () => {
  test("accepts only the declared prefixes", () => {
    expect(isTokenPrefix("cgk")).toBe(true)
    expect(isTokenPrefix("cgd")).toBe(true)
    expect(isTokenPrefix("cgx")).toBe(false)
    expect(isTokenPrefix(null)).toBe(false)
  })
})
