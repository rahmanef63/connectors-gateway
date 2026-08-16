import { describe, expect, test } from "bun:test"
import { MAX_MESSAGE_LENGTH, redact } from "./redact"

const TOKEN = "cp_live_9c2f4a1b7e6d8f3a5b0c1d2e3f4a5b6c"

describe("redact", () => {
  test("removes the exact credential", () => {
    expect(redact(`credential ${TOKEN} rejected`, TOKEN)).toBe("credential [redacted] rejected")
  })

  test("removes an Authorization header echo even for an unrelated secret", () => {
    const out = redact("Authorization: Bearer abc.def.ghi rejected", "other-secret")
    expect(out).not.toContain("abc.def.ghi")
  })

  test("removes a JWT-shaped value", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    expect(redact(`session ${jwt} expired`, "")).not.toContain(jwt)
  })

  test("removes key/value shaped secrets", () => {
    const out = redact('{"api_key":"short1"} and token = short2', "")
    expect(out).not.toContain("short1")
    expect(out).not.toContain("short2")
  })

  test("keeps ordinary prose readable", () => {
    expect(redact("profile is locked for this user", TOKEN)).toBe("profile is locked for this user")
  })

  test("caps the message length", () => {
    const out = redact("x".repeat(20).concat(" ").repeat(60), TOKEN)
    expect(out.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH)
  })

  test("an empty secret does not shred the message", () => {
    expect(redact("plain message", "")).toBe("plain message")
  })
})
