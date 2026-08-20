import { describe, expect, test } from "bun:test"
import { loadConfig } from "./config"

// Crypto material is required in development too, so it belongs in BASE.
const BASE = {
  CONVEX_URL: "http://127.0.0.1:3210",
  GATEWAY_SERVICE_TOKEN: "a-service-token-long-enough",
  JOB_SIGNING_PRIVATE_KEY: "cHJpdmF0ZQ==",
  JOB_SIGNING_PUBLIC_KEY: "cHVibGlj",
  CREDENTIAL_ENCRYPTION_KEY: "a2V5",
}

const PROD = {
  ...BASE,
  NODE_ENV: "production",
  CONVEX_URL: "https://example.convex.cloud",
  WEB_PUBLIC_URL: "https://app.example.com",
  GATEWAY_PUBLIC_URL: "https://gateway.example.com",
}

describe("loadConfig — development defaults", () => {
  test("fills port, url and key id", () => {
    const config = loadConfig(BASE)
    expect(config.env).toBe("development")
    expect(config.port).toBe(8787)
    expect(config.webPublicUrl).toBe("http://localhost:3000")
    expect(config.signing.keyId).toBe("k1")
  })

  test("a trailing slash is normalized away", () => {
    expect(loadConfig({ ...BASE, WEB_PUBLIC_URL: "http://localhost:3000/" }).webPublicUrl).toBe(
      "http://localhost:3000",
    )
  })
})

describe("loadConfig — fail fast", () => {
  test("CONVEX_URL is required in every environment", () => {
    const { CONVEX_URL: _url, ...rest } = BASE
    expect(() => loadConfig(rest)).toThrow("CONVEX_URL")
  })

  test("GATEWAY_SERVICE_TOKEN is required and must not be trivial", () => {
    expect(() => loadConfig({ CONVEX_URL: BASE.CONVEX_URL })).toThrow("GATEWAY_SERVICE_TOKEN")
    expect(() => loadConfig({ ...BASE, GATEWAY_SERVICE_TOKEN: "short" })).toThrow("16 characters")
  })

  test("an out-of-range port is refused", () => {
    expect(() => loadConfig({ ...BASE, GATEWAY_PORT: "0" })).toThrow("GATEWAY_PORT")
    expect(() => loadConfig({ ...BASE, GATEWAY_PORT: "notaport" })).toThrow("GATEWAY_PORT")
  })

  test("a non-http url is refused", () => {
    expect(() => loadConfig({ ...BASE, WEB_PUBLIC_URL: "javascript:alert(1)" })).toThrow(
      "WEB_PUBLIC_URL",
    )
    expect(() => loadConfig({ ...BASE, WEB_PUBLIC_URL: "not a url" })).toThrow("WEB_PUBLIC_URL")
  })

  // An ephemeral dev key signs jobs that stop verifying at the next restart, and
  // seals credentials nothing can reopen. Development gets no exemption.
  test("the signing keypair is required in development too", () => {
    const { JOB_SIGNING_PRIVATE_KEY: _p, ...noPrivate } = BASE
    expect(() => loadConfig(noPrivate)).toThrow("JOB_SIGNING_PRIVATE_KEY")
    const { JOB_SIGNING_PUBLIC_KEY: _q, ...noPublic } = BASE
    expect(() => loadConfig(noPublic)).toThrow("JOB_SIGNING_PUBLIC_KEY")
  })

  test("the credential encryption key is required in development too", () => {
    const { CREDENTIAL_ENCRYPTION_KEY: _k, ...rest } = BASE
    expect(() => loadConfig(rest)).toThrow("CREDENTIAL_ENCRYPTION_KEY")
  })

  test("a missing secret names the command that generates it", () => {
    const { CREDENTIAL_ENCRYPTION_KEY: _k, ...rest } = BASE
    expect(() => loadConfig(rest)).toThrow("keygen")
  })
})

describe("loadConfig — production", () => {
  test("accepts a fully populated production environment", () => {
    const config = loadConfig(PROD)
    expect(config.env).toBe("production")
    expect(config.webPublicUrl).toBe("https://app.example.com")
    expect(config.credentialEncryptionKey).toBe("a2V5")
  })

  test("refuses plaintext http origins (docs/03: TLS only)", () => {
    expect(() => loadConfig({ ...PROD, WEB_PUBLIC_URL: "http://app.example.com" })).toThrow("https")
    expect(() => loadConfig({ ...PROD, CONVEX_URL: "http://example.convex.cloud" })).toThrow("https")
    expect(() => loadConfig({ ...PROD, GATEWAY_PUBLIC_URL: "http://gateway.example.com" })).toThrow(
      "https",
    )
  })

  test("demands its own public origin, naming the omission not the symptom", () => {
    // Every OAuth discovery document embeds this value, so a default would not
    // degrade the service — it would point clients at localhost.
    const { GATEWAY_PUBLIC_URL: _absent, ...rest } = PROD
    expect(() => loadConfig(rest)).toThrow("Missing required environment variable: GATEWAY_PUBLIC_URL")
  })

  test("an error never quotes the offending secret value", () => {
    try {
      loadConfig({ ...BASE, GATEWAY_SERVICE_TOKEN: "sk-live-oops" })
      throw new Error("expected a throw")
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("sk-live")
    }
  })

  test("signing-key rotation overlap is optional and complete triples are preserved", () => {
    expect(loadConfig(BASE).signing.previous).toBeUndefined()
    expect(loadConfig({
      ...BASE,
      JOB_SIGNING_PREVIOUS_PRIVATE_KEY: "old-private",
      JOB_SIGNING_PREVIOUS_PUBLIC_KEY: "old-public",
      JOB_SIGNING_PREVIOUS_KEY_ID: "k0",
    }).signing.previous).toEqual({ privateKey: "old-private", publicKey: "old-public", keyId: "k0" })
  })

  test("signing-key rotation overlap fails closed on partial or same-id configuration", () => {
    expect(() => loadConfig({ ...BASE, JOB_SIGNING_PREVIOUS_PRIVATE_KEY: "old-private" })).toThrow("configured together")
    expect(() => loadConfig({
      ...BASE,
      JOB_SIGNING_PREVIOUS_PRIVATE_KEY: "old-private",
      JOB_SIGNING_PREVIOUS_PUBLIC_KEY: "old-public",
      JOB_SIGNING_PREVIOUS_KEY_ID: "k1",
    })).toThrow("must differ")
  })

})
