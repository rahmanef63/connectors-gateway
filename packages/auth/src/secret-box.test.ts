import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { open, seal } from "./secret-box"

/** Generated per run — never a literal secret in a file. */
function randomKey(bytes = 32): string {
  const raw = new Uint8Array(bytes)
  crypto.getRandomValues(raw)
  return btoa(String.fromCharCode(...raw))
}

const KEY = randomKey()
const PLAINTEXT = "ya29.a0-not-a-real-token"

async function caught(promise: Promise<unknown>): Promise<GatewayError> {
  try {
    await promise
    throw new Error("expected a rejection")
  } catch (error) {
    expect(error).toBeInstanceOf(GatewayError)
    return error as GatewayError
  }
}

describe("seal", () => {
  test("emits v1.<iv>.<cipher> and never the plaintext", async () => {
    const sealed = await seal(PLAINTEXT, KEY)
    const parts = sealed.split(".")
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe("v1")
    expect(parts[1]).toMatch(/^[A-Za-z0-9_-]{16}$/) // 12-byte IV
    expect(sealed.includes(PLAINTEXT)).toBe(false)
  })

  test("uses a fresh IV, so the same plaintext seals differently", async () => {
    const [a, b] = await Promise.all([seal(PLAINTEXT, KEY), seal(PLAINTEXT, KEY)])
    expect(a).not.toBe(b)
  })
})

describe("open", () => {
  test("roundtrips, including empty and unicode payloads", async () => {
    expect(await open(await seal(PLAINTEXT, KEY), KEY)).toBe(PLAINTEXT)
    expect(await open(await seal("", KEY), KEY)).toBe("")
    expect(await open(await seal("ключ · 密钥 · 🔐", KEY), KEY)).toBe("ключ · 密钥 · 🔐")
    const long = "x".repeat(20_000)
    expect(await open(await seal(long, KEY), KEY)).toBe(long)
  })

  test("DENIED: the wrong key throws INTERNAL with no crypto detail", async () => {
    const sealed = await seal(PLAINTEXT, KEY)
    const error = await caught(open(sealed, randomKey()))
    expect(error.code).toBe("INTERNAL")
    expect(error.message).toBe("Credential unavailable.")
    for (const leak of ["AES", "GCM", "decrypt", "tag", "OperationError", PLAINTEXT, KEY]) {
      expect(error.message.includes(leak)).toBe(false)
    }
  })

  test("DENIED: tampered ciphertext fails the tag check", async () => {
    const sealed = await seal(PLAINTEXT, KEY)
    const parts = sealed.split(".")
    const cipher = parts[2] ?? ""
    const flipped = `${cipher[0] === "A" ? "B" : "A"}${cipher.slice(1)}`
    const error = await caught(open(`v1.${parts[1]}.${flipped}`, KEY))
    expect(error.code).toBe("INTERNAL")
  })

  test("DENIED: malformed envelopes", async () => {
    const sealed = await seal(PLAINTEXT, KEY)
    const parts = sealed.split(".")
    for (const value of [
      "",
      "v1",
      "v1.only-two",
      `v2.${parts[1]}.${parts[2]}`,
      `v1.${parts[1]}.${parts[2]}.extra`,
      `v1..${parts[2]}`,
      `v1.${parts[1]}.`,
      `v1.AAAA.${parts[2]}`, // IV wrong length
      `v1.${parts[1]}.AAAA`, // shorter than the GCM tag
      `v1.!!!!.${parts[2]}`,
      sealed.toUpperCase(),
    ]) {
      const error = await caught(open(value, KEY))
      expect(error.message).toBe("Credential unavailable.")
    }
  })

  test("DENIED: keys of the wrong shape, on seal and on open", async () => {
    const sealed = await seal(PLAINTEXT, KEY)
    for (const key of ["", "short", randomKey(16), randomKey(64), "!!!!", KEY.slice(0, 10)]) {
      expect((await caught(seal(PLAINTEXT, key))).code).toBe("INTERNAL")
      expect((await caught(open(sealed, key))).code).toBe("INTERNAL")
    }
  })

  test("accepts a base64url-encoded key as well as standard base64", async () => {
    const urlSafe = KEY.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
    expect(await open(await seal(PLAINTEXT, KEY), urlSafe)).toBe(PLAINTEXT)
  })
})
