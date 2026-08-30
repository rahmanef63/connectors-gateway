import { describe, expect, test } from "bun:test"
import { importPrivateKey, importPublicKey } from "@cg/protocol"
import { deriveGatewaySecrets, resolveGatewaySecrets } from "./derive"
import { open, seal } from "./secret-box"

const SECRET = "K5rQ3nZ8vB2xW9tY6uI0pA4sD7fG1hJ3kL5mN8qR2wE="

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

describe("deriveGatewaySecrets", () => {
  test("is deterministic — the whole design rests on this", async () => {
    // The Convex deployment and the Next.js process never exchange the service
    // token; they each derive it. If this is ever not true, the gateway silently
    // loses its control plane.
    expect(await deriveGatewaySecrets(SECRET)).toEqual(await deriveGatewaySecrets(SECRET))
  })

  test("a different root secret yields a completely different set", async () => {
    const a = await deriveGatewaySecrets(SECRET)
    const b = await deriveGatewaySecrets(`${SECRET}x`)
    expect(b.serviceToken).not.toBe(a.serviceToken)
    expect(b.credentialEncryptionKey).not.toBe(a.credentialEncryptionKey)
    expect(b.jobSigningPublicKey).not.toBe(a.jobSigningPublicKey)
  })

  test("the four values are distinct — one label must never collide with another", async () => {
    const derived = await deriveGatewaySecrets(SECRET)
    const values = new Set([
      derived.credentialEncryptionKey,
      derived.serviceToken,
      derived.jobSigningPrivateKey,
      derived.jobSigningPublicKey,
    ])
    expect(values.size).toBe(4)
  })

  test("the credential key is what secret-box accepts: base64, 32 bytes", async () => {
    const { credentialEncryptionKey } = await deriveGatewaySecrets(SECRET)
    expect(fromBase64(credentialEncryptionKey)).toHaveLength(32)

    const sealed = await seal("upstream-token", credentialEncryptionKey)
    expect(await open(sealed, credentialEncryptionKey)).toBe("upstream-token")
  })

  test("the signing pair imports through @cg/protocol and actually signs", async () => {
    // The gateway imports these with the same two calls at boot (app.ts). A pair
    // that derives but does not import would fail at the first job dispatch.
    const { jobSigningPrivateKey, jobSigningPublicKey } = await deriveGatewaySecrets(SECRET)
    const privateKey = await importPrivateKey(jobSigningPrivateKey)
    const publicKey = await importPublicKey(jobSigningPublicKey)

    const message = new TextEncoder().encode("job envelope")
    const signature = await crypto.subtle.sign({ name: "Ed25519" }, privateKey, message)
    expect(await crypto.subtle.verify({ name: "Ed25519" }, publicKey, signature, message)).toBe(true)
  })

  test("RFC 8410 framing: 48-byte PKCS#8, 44-byte SPKI", async () => {
    const derived = await deriveGatewaySecrets(SECRET)
    expect(fromBase64(derived.jobSigningPrivateKey)).toHaveLength(16 + 32)
    expect(fromBase64(derived.jobSigningPublicKey)).toHaveLength(12 + 32)
  })

  test("a placeholder-length secret is refused, and the error says how to make one", async () => {
    expect(deriveGatewaySecrets("short")).rejects.toThrow(/openssl rand -base64 48/)
  })
})

describe("resolveGatewaySecrets", () => {
  test("an explicit value wins — this is the migration path for a live deployment", async () => {
    // Sealed credentials are unopenable under a different key, so setting
    // GATEWAY_SECRET must never displace a CREDENTIAL_ENCRYPTION_KEY that is
    // already opening them.
    const derived = await deriveGatewaySecrets(SECRET)
    const resolved = await resolveGatewaySecrets({
      GATEWAY_SECRET: SECRET,
      CREDENTIAL_ENCRYPTION_KEY: "kept",
    })
    expect(resolved.CREDENTIAL_ENCRYPTION_KEY).toBe("kept")
    expect(resolved.GATEWAY_SERVICE_TOKEN).toBe(derived.serviceToken)
  })

  test("an empty explicit value does not count as set", async () => {
    const derived = await deriveGatewaySecrets(SECRET)
    const resolved = await resolveGatewaySecrets({
      GATEWAY_SECRET: SECRET,
      GATEWAY_SERVICE_TOKEN: "   ",
    })
    expect(resolved.GATEWAY_SERVICE_TOKEN).toBe(derived.serviceToken)
  })

  test("without GATEWAY_SECRET the environment is returned untouched", async () => {
    // Every pre-derivation deployment has this shape. Filling in a guess here
    // would replace loadConfig's precise "Missing X" with a vague failure.
    const env = { CONVEX_URL: "https://example.convex.cloud" }
    expect(await resolveGatewaySecrets(env)).toEqual(env)
  })
})
