import { beforeAll, describe, expect, test } from "bun:test"
import { generateSigningKeyPair, importPrivateKey, importPublicKey } from "./keys"
import { signKeyRotation, verifyKeyRotation } from "./key-rotation"

let previous: Awaited<ReturnType<typeof generateSigningKeyPair>>
let next: Awaited<ReturnType<typeof generateSigningKeyPair>>

beforeAll(async () => {
  previous = await generateSigningKeyPair()
  next = await generateSigningKeyPair()
})

function statement() {
  return { previousKeyId: "k1", nextKeyId: "k2", nextPublicKey: next.publicKey }
}

describe("signed job-key rotation", () => {
  test("the previous key authorizes exactly one successor statement", async () => {
    const proof = await signKeyRotation(statement(), await importPrivateKey(previous.privateKey))
    await expect(verifyKeyRotation(proof, await importPublicKey(previous.publicKey))).resolves.toEqual(statement())
  })

  test("tampering with the successor key id or public key invalidates the proof", async () => {
    const proof = await signKeyRotation(statement(), await importPrivateKey(previous.privateKey))
    await expect(verifyKeyRotation({ ...proof, nextKeyId: "k3" }, await importPublicKey(previous.publicKey))).rejects.toThrow()
    await expect(verifyKeyRotation({ ...proof, nextPublicKey: previous.publicKey }, await importPublicKey(previous.publicKey))).rejects.toThrow()
  })

  test("a different private key cannot authorize the rotation", async () => {
    const proof = await signKeyRotation(statement(), await importPrivateKey(next.privateKey))
    await expect(verifyKeyRotation(proof, await importPublicKey(previous.publicKey))).rejects.toThrow()
  })
})
