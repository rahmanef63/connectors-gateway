import { beforeAll, describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { createJobEnvelope, generateSigningKeyPair, importPrivateKey, signJob, signKeyRotation } from "@cg/protocol"
import type { SignedJob } from "@cg/protocol"
import { createKeyStore } from "./key-store"
import type { PinnedKey } from "./key-store"

let gateway: PinnedKey
let impostor: PinnedKey
let signed: SignedJob
let real: Awaited<ReturnType<typeof generateSigningKeyPair>>
let fake: Awaited<ReturnType<typeof generateSigningKeyPair>>

beforeAll(async () => {
  real = await generateSigningKeyPair()
  fake = await generateSigningKeyPair()
  gateway = { signingPublicKey: real.publicKey, keyId: "k1" }
  impostor = { signingPublicKey: fake.publicKey, keyId: "k1" }
  signed = await signJob(
    createJobEnvelope({
      connector: "blender",
      action: "blender.scene.render",
      input: {},
      requestContext: { requestId: "req_1", userId: "usr_1" },
    }),
    { privateKey: await importPrivateKey(real.privateKey), keyId: "k1" },
  )
})

describe("createKeyStore", () => {
  test("DENIED: every job is refused until a key is pinned", async () => {
    const keys = createKeyStore()
    expect(keys.pinned()).toBeUndefined()
    try {
      await keys.verify(signed)
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("NOT_AUTHORIZED")
    }
  })

  test("trust-on-first-use adopts, persists and then verifies", async () => {
    const persisted: PinnedKey[] = []
    const keys = createKeyStore({ persist: (key) => void persisted.push(key) })
    expect(await keys.trust(gateway)).toBe("adopted")
    expect(persisted).toEqual([gateway])
    expect(keys.pinned()).toEqual(gateway)
    expect((await keys.verify(signed)).connector).toBe("blender")
  })

  test("re-announcing the same key is a no-op, not a re-adoption", async () => {
    const persisted: PinnedKey[] = []
    const keys = createKeyStore({ initial: gateway, persist: (key) => void persisted.push(key) })
    expect(await keys.trust(gateway)).toBe("unchanged")
    expect(persisted).toEqual([])
  })

  test("DENIED: a different key is a conflict and never replaces the pin", async () => {
    const persisted: PinnedKey[] = []
    const keys = createKeyStore({ initial: gateway, persist: (key) => void persisted.push(key) })
    expect(await keys.trust(impostor)).toBe("conflict")
    expect(await keys.trust({ ...gateway, keyId: "k2" })).toBe("conflict")
    expect(keys.pinned()).toEqual(gateway)
    expect(persisted).toEqual([])
  })

  test("DENIED: a job signed by the impostor fails once the real key is pinned", async () => {
    const keys = createKeyStore({ initial: impostor })
    try {
      await keys.verify(signed)
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("NOT_AUTHORIZED")
    }
  })

  test("DENIED: unusable key material is rejected before it is stored", async () => {
    const keys = createKeyStore()
    await expect(keys.trust({ signingPublicKey: "not-a-key", keyId: "k1" })).rejects.toThrow(GatewayError)
    expect(keys.pinned()).toBeUndefined()
  })

  test("a proof signed by the pinned key rotates atomically and persists the successor", async () => {
    const successor = await generateSigningKeyPair()
    const persisted: PinnedKey[] = []
    const keys = createKeyStore({ initial: gateway, persist: (key) => persisted.push(key) })
    const proof = await signKeyRotation(
      { previousKeyId: gateway.keyId, nextKeyId: "k2", nextPublicKey: successor.publicKey },
      await importPrivateKey(real.privateKey),
    )

    expect(await keys.trust({ signingPublicKey: successor.publicKey, keyId: "k2" }, proof)).toBe("rotated")
    expect(keys.pinned()).toEqual({ signingPublicKey: successor.publicKey, keyId: "k2" })
    expect(persisted).toEqual([{ signingPublicKey: successor.publicKey, keyId: "k2" }])

    const envelope = createJobEnvelope({ connector: "blender", action: "scene.inspect", input: {}, requestContext: { requestId: "req_rotate", userId: "usr_1" } })
    const signed = await signJob(envelope, { privateKey: await importPrivateKey(successor.privateKey), keyId: "k2" })
    await expect(keys.verify(signed)).resolves.toEqual(envelope)
  })

  test("a forged, mismatched, or replayed rotation proof never changes the current pin", async () => {
    const successor = await generateSigningKeyPair()
    const later = await generateSigningKeyPair()
    const keys = createKeyStore({ initial: gateway })
    const good = await signKeyRotation(
      { previousKeyId: gateway.keyId, nextKeyId: "k2", nextPublicKey: successor.publicKey },
      await importPrivateKey(real.privateKey),
    )
    const forged = await signKeyRotation(
      { previousKeyId: gateway.keyId, nextKeyId: "k2", nextPublicKey: successor.publicKey },
      await importPrivateKey(fake.privateKey),
    )

    await expect(keys.trust({ signingPublicKey: successor.publicKey, keyId: "k2" }, forged)).rejects.toThrow()
    expect(keys.pinned()).toEqual(gateway)
    expect(await keys.trust({ signingPublicKey: later.publicKey, keyId: "k3" }, good)).toBe("conflict")
    expect(keys.pinned()).toEqual(gateway)
    expect(await keys.trust({ signingPublicKey: successor.publicKey, keyId: "k2" }, good)).toBe("rotated")
    // Once at k2, replaying k1 -> k2 against a different announcement cannot downgrade/advance it.
    await expect(keys.trust(gateway, good)).rejects.toThrow()
    expect(keys.pinned()?.keyId).toBe("k2")
  })

})
