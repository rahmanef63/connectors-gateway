import { beforeAll, describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { createJobEnvelope } from "./envelope"
import { generateSigningKeyPair, importPrivateKey, importPublicKey } from "./keys"
import { MAX_CLOCK_SKEW_MS, signJob, verifyJob } from "./sign"
import type { JobEnvelope, SignedJob } from "./types"

const KEY_ID = "key_1"
const NOW = 1_760_000_000_000

let privateKey: CryptoKey
let publicKey: CryptoKey
let otherPublicKey: CryptoKey

beforeAll(async () => {
  const pair = await generateSigningKeyPair()
  const other = await generateSigningKeyPair()
  privateKey = await importPrivateKey(pair.privateKey)
  publicKey = await importPublicKey(pair.publicKey)
  otherPublicKey = await importPublicKey(other.publicKey)
})

function envelope(overrides: Partial<JobEnvelope> = {}): JobEnvelope {
  const base = createJobEnvelope({
    connector: "demo",
    action: "thing.do",
    input: { scale: 2, name: "cube" },
    requestContext: { requestId: "req_1", userId: "usr_1", workspaceId: "wrk_1" },
    ttlMs: 30_000,
    now: NOW,
  })
  return { ...base, ...overrides }
}

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (error) {
    return error instanceof GatewayError ? error.code : "NOT_A_GATEWAY_ERROR"
  }
  return "NO_THROW"
}

describe("signJob / verifyJob", () => {
  test("round trips", async () => {
    const payload = envelope()
    const signed = await signJob(payload, { privateKey, keyId: KEY_ID })
    expect(signed.keyId).toBe(KEY_ID)
    expect(signed.signature.length).toBeGreaterThan(0)
    expect(await verifyJob(signed, { publicKey, keyId: KEY_ID, now: NOW })).toEqual(payload)
  })

  test("survives a JSON round trip over the wire", async () => {
    const signed = await signJob(envelope(), { privateKey, keyId: KEY_ID })
    const overWire = JSON.parse(JSON.stringify(signed)) as SignedJob
    const verified = await verifyJob(overWire, { publicKey, keyId: KEY_ID, now: NOW })
    expect(verified.id).toBe(signed.payload.id)
  })

  test("is insensitive to key order, because the preimage is canonical", async () => {
    const payload = envelope()
    const signed = await signJob(payload, { privateKey, keyId: KEY_ID })
    const reordered: SignedJob = {
      ...signed,
      payload: {
        nonce: payload.nonce,
        requestContext: { userId: "usr_1", workspaceId: "wrk_1", requestId: "req_1" },
        input: { name: "cube", scale: 2 },
        action: payload.action,
        connector: payload.connector,
        expiresAt: payload.expiresAt,
        issuedAt: payload.issuedAt,
        protocolVersion: payload.protocolVersion,
        id: payload.id,
      },
    }
    expect((await verifyJob(reordered, { publicKey, keyId: KEY_ID, now: NOW })).id).toBe(payload.id)
  })
})

describe("verifyJob denials", () => {
  test("rejects a tampered payload", async () => {
    const signed = await signJob(envelope(), { privateKey, keyId: KEY_ID })
    const tampered: SignedJob = { ...signed, payload: { ...signed.payload, action: "thing.destroy" } }
    expect(await codeOf(() => verifyJob(tampered, { publicKey, keyId: KEY_ID, now: NOW }))).toBe("NOT_AUTHORIZED")
  })

  test("rejects a tampered nested input value", async () => {
    const signed = await signJob(envelope(), { privateKey, keyId: KEY_ID })
    const tampered: SignedJob = { ...signed, payload: { ...signed.payload, input: { scale: 999, name: "cube" } } }
    expect(await codeOf(() => verifyJob(tampered, { publicKey, keyId: KEY_ID, now: NOW }))).toBe("NOT_AUTHORIZED")
  })

  test("rejects a tampered identity claim", async () => {
    const signed = await signJob(envelope(), { privateKey, keyId: KEY_ID })
    const tampered: SignedJob = {
      ...signed,
      payload: { ...signed.payload, requestContext: { requestId: "req_1", userId: "usr_attacker" } },
    }
    expect(await codeOf(() => verifyJob(tampered, { publicKey, keyId: KEY_ID, now: NOW }))).toBe("NOT_AUTHORIZED")
  })

  test("rejects a wrong key id", async () => {
    const signed = await signJob(envelope(), { privateKey, keyId: "key_old" })
    expect(await codeOf(() => verifyJob(signed, { publicKey, keyId: KEY_ID, now: NOW }))).toBe("NOT_AUTHORIZED")
  })

  test("rejects a signature made by another key", async () => {
    const signed = await signJob(envelope(), { privateKey, keyId: KEY_ID })
    expect(await codeOf(() => verifyJob(signed, { publicKey: otherPublicKey, keyId: KEY_ID, now: NOW }))).toBe(
      "NOT_AUTHORIZED",
    )
  })

  test("rejects a garbage or empty signature", async () => {
    const signed = await signJob(envelope(), { privateKey, keyId: KEY_ID })
    for (const signature of ["", "!!!!", "AAAA", signed.signature.slice(0, -2)]) {
      expect(await codeOf(() => verifyJob({ ...signed, signature }, { publicKey, keyId: KEY_ID, now: NOW }))).toBe(
        "NOT_AUTHORIZED",
      )
    }
  })

  test("rejects an expired envelope", async () => {
    const signed = await signJob(envelope(), { privateKey, keyId: KEY_ID })
    expect(await codeOf(() => verifyJob(signed, { publicKey, keyId: KEY_ID, now: NOW + 30_001 }))).toBe("TIMEOUT")
    // Still valid on the exact expiry millisecond.
    expect((await verifyJob(signed, { publicKey, keyId: KEY_ID, now: NOW + 30_000 })).id).toBe(signed.payload.id)
  })

  test("rejects an envelope issued too far in the future", async () => {
    const future = NOW + MAX_CLOCK_SKEW_MS + 1
    const signed = await signJob(envelope({ issuedAt: future, expiresAt: future + 30_000 }), {
      privateKey,
      keyId: KEY_ID,
    })
    expect(await codeOf(() => verifyJob(signed, { publicKey, keyId: KEY_ID, now: NOW }))).toBe("TIMEOUT")
  })

  test("tolerates clock skew inside the window", async () => {
    const future = NOW + MAX_CLOCK_SKEW_MS
    const signed = await signJob(envelope({ issuedAt: future, expiresAt: future + 30_000 }), {
      privateKey,
      keyId: KEY_ID,
    })
    expect((await verifyJob(signed, { publicKey, keyId: KEY_ID, now: NOW })).issuedAt).toBe(future)
  })

  test("rejects a protocol version mismatch", async () => {
    const signed = await signJob(envelope({ protocolVersion: "99" }), { privateKey, keyId: KEY_ID })
    expect(await codeOf(() => verifyJob(signed, { publicKey, keyId: KEY_ID, now: NOW }))).toBe("INVALID_INPUT")
  })

  test("rejects a structurally invalid envelope even when signed", async () => {
    const broken = { ...envelope(), nonce: 42 } as unknown as JobEnvelope
    const signed = await signJob(broken, { privateKey, keyId: KEY_ID })
    expect(await codeOf(() => verifyJob(signed, { publicKey, keyId: KEY_ID, now: NOW }))).toBe("INVALID_INPUT")
  })

  test("rejects a non-object signed job or payload", async () => {
    expect(await codeOf(() => verifyJob(null as unknown as SignedJob, { publicKey, keyId: KEY_ID }))).toBe(
      "INVALID_INPUT",
    )
    expect(
      await codeOf(() => verifyJob({ payload: "x", signature: "y", keyId: KEY_ID } as unknown as SignedJob, {
        publicKey,
        keyId: KEY_ID,
      })),
    ).toBe("INVALID_INPUT")
  })

  test("checks the signature BEFORE any claim", async () => {
    // Expired AND tampered: the answer must be the authentication failure.
    const signed = await signJob(envelope(), { privateKey, keyId: KEY_ID })
    const tampered: SignedJob = { ...signed, payload: { ...signed.payload, connector: "evil" } }
    expect(await codeOf(() => verifyJob(tampered, { publicKey, keyId: KEY_ID, now: NOW + 10_000_000 }))).toBe(
      "NOT_AUTHORIZED",
    )
  })
})
