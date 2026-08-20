import { describe, expect, test } from "bun:test"
import { PEER_AUTH_WINDOW_MS, signPeerRequest, verifyPeerRequest } from "./peer-auth"

describe("peer request HMAC", () => {
  test("authenticates the exact body without putting the secret in headers", () => {
    const secret = "service-secret-never-on-the-wire"
    const body = '{"payload":"ciphertext"}'
    const auth = signPeerRequest(secret, body, 1_800_000_000_000)
    expect(JSON.stringify(auth)).not.toContain(secret)
    expect(verifyPeerRequest(secret, body, auth, 1_800_000_000_001)).toBe(true)
    expect(verifyPeerRequest(secret, body + "x", auth, 1_800_000_000_001)).toBe(false)
  })

  test("rejects stale signatures and a wrong secret", () => {
    const body = "{}"
    const auth = signPeerRequest("correct-secret", body, 1_800_000_000_000)
    expect(verifyPeerRequest("wrong-secret", body, auth, 1_800_000_000_000)).toBe(false)
    expect(verifyPeerRequest("correct-secret", body, auth, 1_800_000_000_000 + PEER_AUTH_WINDOW_MS + 1)).toBe(false)
  })
})
