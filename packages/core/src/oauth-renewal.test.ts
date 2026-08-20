import { describe, expect, test } from "bun:test"
import {
  encodeOAuthRenewal,
  parseOAuthRenewal,
  type ClientCredentialsRenewal,
  type RefreshTokenRenewal,
} from "./oauth-renewal"

const refresh: RefreshTokenRenewal = {
  v: 1,
  grantType: "refresh_token",
  tokenEndpoint: "https://auth.example.test/oauth/token",
  clientId: "client_1",
  clientSecret: null,
  refreshToken: "refresh_secret_1",
  scope: "mcp.read mcp.write",
  resource: "https://api.example.test/mcp",
}

const machine: ClientCredentialsRenewal = {
  v: 1,
  grantType: "client_credentials",
  tokenEndpoint: "https://auth.example.test/oauth/token",
  clientId: "machine_1",
  clientSecret: "machine_secret_1",
  scope: null,
  resource: "https://api.example.test/mcp",
}

describe("OAuth renewal envelope", () => {
  test("round-trips a refresh-token grant in one canonical document", () => {
    expect(parseOAuthRenewal(encodeOAuthRenewal(refresh))).toEqual(refresh)
  })

  test("round-trips client credentials without inventing a refresh token", () => {
    expect(parseOAuthRenewal(encodeOAuthRenewal(machine))).toEqual(machine)
  })

  test("refuses malformed, wrong-version, and unknown grant documents", () => {
    expect(parseOAuthRenewal("not json")).toBeNull()
    expect(parseOAuthRenewal(JSON.stringify({ ...refresh, v: 2 }))).toBeNull()
    expect(parseOAuthRenewal(JSON.stringify({ ...refresh, grantType: "password" }))).toBeNull()
  })

  test("requires the secret appropriate to each grant", () => {
    expect(parseOAuthRenewal(JSON.stringify({ ...refresh, refreshToken: "" }))).toBeNull()
    expect(parseOAuthRenewal(JSON.stringify({ ...machine, clientSecret: null }))).toBeNull()
  })

  test("bounds the decrypted document before parsing", () => {
    expect(parseOAuthRenewal("x".repeat(32 * 1024 + 1))).toBeNull()
  })

  test("the encoder never repeats an invalid secret in its error", () => {
    const secret = "super-secret-invalid-value"
    try {
      encodeOAuthRenewal({ ...refresh, refreshToken: "", clientSecret: secret })
      throw new Error("expected failure")
    } catch (error) {
      expect(String(error)).not.toContain(secret)
    }
  })
})
