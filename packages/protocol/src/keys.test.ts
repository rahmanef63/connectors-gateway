import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { toBase64 } from "./base64"
import { generateSigningKeyPair, importPrivateKey, importPublicKey } from "./keys"

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (error) {
    return error instanceof GatewayError ? error.code : "NOT_A_GATEWAY_ERROR"
  }
  return "NO_THROW"
}

describe("signing keys", () => {
  test("generates an importable Ed25519 pair", async () => {
    const pair = await generateSigningKeyPair()
    expect(pair.privateKey).not.toBe(pair.publicKey)

    const privateKey = await importPrivateKey(pair.privateKey)
    const publicKey = await importPublicKey(pair.publicKey)
    expect(privateKey.type).toBe("private")
    expect(publicKey.type).toBe("public")
    expect(privateKey.algorithm.name).toBe("Ed25519")
    expect(privateKey.usages).toEqual(["sign"])
    expect(publicKey.usages).toEqual(["verify"])
  })

  test("the private key is not extractable once imported", async () => {
    const pair = await generateSigningKeyPair()
    const privateKey = await importPrivateKey(pair.privateKey)
    expect(privateKey.extractable).toBe(false)
  })

  test("each pair is distinct", async () => {
    const [first, second] = await Promise.all([generateSigningKeyPair(), generateSigningKeyPair()])
    expect(first.privateKey).not.toBe(second.privateKey)
    expect(first.publicKey).not.toBe(second.publicKey)
  })

  test("rejects missing, malformed and swapped key material", async () => {
    const pair = await generateSigningKeyPair()
    expect(await codeOf(() => importPrivateKey(""))).toBe("INVALID_INPUT")
    expect(await codeOf(() => importPublicKey(""))).toBe("INVALID_INPUT")
    expect(await codeOf(() => importPrivateKey("not base64!"))).toBe("INVALID_INPUT")
    expect(await codeOf(() => importPrivateKey(toBase64(new Uint8Array([1, 2, 3, 4]))))).toBe("INVALID_INPUT")
    // A public key is not a private key, and vice versa.
    expect(await codeOf(() => importPrivateKey(pair.publicKey))).toBe("INVALID_INPUT")
    expect(await codeOf(() => importPublicKey(pair.privateKey))).toBe("INVALID_INPUT")
  })

  test("an import failure never leaks the key material", async () => {
    const pair = await generateSigningKeyPair()
    try {
      await importPublicKey(pair.privateKey)
      throw new Error("expected a throw")
    } catch (error) {
      expect((error as GatewayError).message.includes(pair.privateKey)).toBe(false)
    }
  })
})
