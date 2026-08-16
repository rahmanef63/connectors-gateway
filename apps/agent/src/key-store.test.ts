import { beforeAll, describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { createJobEnvelope, generateSigningKeyPair, importPrivateKey, signJob } from "@cg/protocol"
import type { SignedJob } from "@cg/protocol"
import { createKeyStore } from "./key-store"
import type { PinnedKey } from "./key-store"

let gateway: PinnedKey
let impostor: PinnedKey
let signed: SignedJob

beforeAll(async () => {
  const real = await generateSigningKeyPair()
  const fake = await generateSigningKeyPair()
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
})
