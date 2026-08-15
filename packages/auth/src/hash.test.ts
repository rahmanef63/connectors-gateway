import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { PBKDF2_ITERATIONS, dummyStoredHash, hashSecret, verifySecret } from "./hash"

describe("hashSecret", () => {
  test("produces the documented format", async () => {
    const stored = await hashSecret("correct horse battery staple")
    const parts = stored.split("$")
    expect(parts).toHaveLength(5)
    expect(parts[0]).toBe("pbkdf2")
    expect(parts[1]).toBe("sha256")
    expect(parts[2]).toBe(String(PBKDF2_ITERATIONS))
    // 16-byte salt and 32-byte key, base64url without padding.
    expect(parts[3]).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(parts[4]).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  test("salts each call, so the same secret hashes differently", async () => {
    const [a, b] = await Promise.all([hashSecret("same"), hashSecret("same")])
    expect(a).not.toBe(b)
  })

  test("rejects an empty secret", async () => {
    await expect(hashSecret("")).rejects.toBeInstanceOf(GatewayError)
  })
})

describe("verifySecret", () => {
  test("roundtrips", async () => {
    const stored = await hashSecret("s3cret-value")
    expect(await verifySecret("s3cret-value", stored)).toBe(true)
  })

  test("DENIED: wrong secret", async () => {
    const stored = await hashSecret("s3cret-value")
    expect(await verifySecret("s3cret-valuf", stored)).toBe(false)
    expect(await verifySecret("", stored)).toBe(false)
    expect(await verifySecret("s3cret-value ", stored)).toBe(false)
  })

  test("DENIED: tampered stored value returns false without throwing", async () => {
    const stored = await hashSecret("s3cret-value")
    const [, , iterations, salt, hash] = stored.split("$")
    const tampered = [
      "",
      "not-a-hash",
      "pbkdf2$sha256$210000$$",
      `pbkdf2$sha1$${iterations}$${salt}$${hash}`,
      `scrypt$sha256$${iterations}$${salt}$${hash}`,
      `pbkdf2$sha256$0$${salt}$${hash}`,
      `pbkdf2$sha256$999999999$${salt}$${hash}`,
      `pbkdf2$sha256$abc$${salt}$${hash}`,
      `pbkdf2$sha256$${iterations}$${salt}$${hash}$extra`,
      `pbkdf2$sha256$${iterations}$${salt}`,
      `pbkdf2$sha256$${iterations}$!!!!$${hash}`,
      `pbkdf2$sha256$${iterations}$${salt}$AAAA`, // hash too short
      stored.slice(0, -4), // truncated hash
    ]
    for (const value of tampered) {
      expect(await verifySecret("s3cret-value", value)).toBe(false)
    }
  })

  test("DENIED: a flipped hash byte fails the constant-time compare", async () => {
    const stored = await hashSecret("s3cret-value")
    const parts = stored.split("$")
    const hash = parts[4] ?? ""
    const first = hash[0] === "A" ? "B" : "A"
    parts[4] = `${first}${hash.slice(1)}`
    expect(await verifySecret("s3cret-value", parts.join("$"))).toBe(false)
  })
})

describe("dummyStoredHash", () => {
  test("is a valid, stable, non-matching hash", async () => {
    const first = await dummyStoredHash()
    const second = await dummyStoredHash()
    expect(first).toBe(second)
    expect(first.startsWith("pbkdf2$sha256$")).toBe(true)
    expect(await verifySecret("anything", first)).toBe(false)
  })
})
