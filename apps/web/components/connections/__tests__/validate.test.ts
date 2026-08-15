// @vitest-environment node
import { describe, expect, test } from "vitest"

import {
  validateBaseUrl,
  validateConnectionForm,
  validateConnectorId,
  validateSealedToken,
  type FieldIssue,
  type FieldResult,
} from "../validate"

/** A real `seal()` envelope: `v1.<12-byte iv>.<ciphertext+tag>`, base64url. */
const SEALED = "v1.SGVsbG9Xb3JsZDEy.YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo"

const issueOf = (result: FieldResult): FieldIssue | undefined =>
  result.ok ? undefined : result.issue

describe("validateConnectorId", () => {
  test("accepts a registry id and trims it", () => {
    expect(validateConnectorId("  careerpack  ")).toEqual({ ok: true, value: "careerpack" })
    expect(validateConnectorId("blender-2")).toEqual({ ok: true, value: "blender-2" })
  })

  test.each<[string, string, FieldIssue]>([
    ["empty", "   ", "connector_empty"],
    ["a space inside", "career pack", "connector_shape"],
    ["a leading dash", "-careerpack", "connector_shape"],
    ["a path traversal", "../../etc", "connector_shape"],
    ["too long", "a".repeat(129), "connector_shape"],
  ])("rejects %s", (_name, value, issue) => {
    expect(issueOf(validateConnectorId(value))).toBe(issue)
  })
})

describe("validateBaseUrl", () => {
  test("canonicalises to origin + path", () => {
    expect(validateBaseUrl(" https://api.example.com/v1/ ")).toEqual({
      ok: true,
      value: "https://api.example.com/v1",
    })
    expect(validateBaseUrl("https://api.example.com")).toEqual({
      ok: true,
      value: "https://api.example.com",
    })
  })

  test("drops a query string, which is not an encrypted field", () => {
    expect(validateBaseUrl("https://api.example.com/v1?token=hunter2")).toEqual({
      ok: true,
      value: "https://api.example.com/v1",
    })
  })

  test.each<[string, string, FieldIssue]>([
    ["nothing", "", "url_empty"],
    ["a bare hostname", "api.example.com", "url_invalid"],
    ["a non-http scheme", "ftp://api.example.com", "url_invalid"],
    ["javascript:", "javascript:alert(1)", "url_invalid"],
    ["embedded credentials", "https://user:secret@api.example.com", "url_credentials"],
    ["plain http to a public host", "http://api.example.com", "url_scheme"],
  ])("rejects %s", (_name, value, issue) => {
    expect(issueOf(validateBaseUrl(value))).toBe(issue)
  })

  // The SSRF list. These are the ones a user actually hits, and the reason the
  // copy for `url_unreachable` says "not reachable from the gateway". The rules
  // are the control plane's own (`convex/_shared/ip_literal.ts`, imported here
  // rather than restated), so this list is the same set it refuses.
  test.each([
    "https://localhost",
    "https://sub.localhost",
    "https://127.0.0.1",
    "https://10.0.0.5",
    "https://192.168.1.10",
    "https://172.16.0.9",
    "https://172.31.255.1",
    "https://169.254.169.254/latest/meta-data",
    "https://0.0.0.0",
    "https://[::1]",
    "https://[fd00::1]",
    "https://[fe80::1]",
    "https://[::ffff:169.254.169.254]",
  ])("refuses %s as unreachable from the gateway", (value) => {
    expect(issueOf(validateBaseUrl(value))).toBe("url_unreachable")
  })

  // PARITY. A rule here that the control plane does not have would refuse a
  // connection the product actually allows, so these stay accepted: the server
  // resolves no DNS and neither do we.
  test.each([
    ["172.32, one octet past the private block", "https://172.32.0.1"],
    ["a public IPv6 literal", "https://[2606:4700::1111]"],
    ["a single-label host", "https://intranet"],
    ["an internal-sounding suffix", "https://api.internal"],
    ["the CGNAT range, which the gateway does not block", "https://100.64.0.1"],
    ["the alternate https port", "https://api.example.com:8443"],
    ["an explicit default port, which URL drops", "https://api.example.com:443"],
  ])("accepts %s", (_name, value) => {
    expect(validateBaseUrl(value).ok).toBe(true)
  })

  test("refuses a port the gateway does not call", () => {
    expect(issueOf(validateBaseUrl("https://api.example.com:8080"))).toBe("url_port")
    expect(issueOf(validateBaseUrl("https://api.example.com:3000"))).toBe("url_port")
  })

  test("refuses a base URL pointing back at this deployment", () => {
    const selfHosts = ["connect.example.com", "api-connectors.example.com"]
    expect(issueOf(validateBaseUrl("https://connect.example.com/v1", { selfHosts }))).toBe(
      "url_self",
    )
    // Case and whitespace in the supplied list must not open the hole.
    expect(issueOf(validateBaseUrl("https://CONNECT.example.com", { selfHosts: [" Connect.Example.com "] }))).toBe(
      "url_self",
    )
    expect(validateBaseUrl("https://api.example.com", { selfHosts }).ok).toBe(true)
  })

  test("a trailing dot is not a way around any host rule", () => {
    // `localhost.` resolves to localhost, so it must fail for the same reason.
    expect(issueOf(validateBaseUrl("https://localhost./v1"))).toBe("url_unreachable")
    expect(issueOf(validateBaseUrl("https://localhost../v1"))).toBe("url_unreachable")
    expect(
      issueOf(validateBaseUrl("https://connect.example.com./v1", { selfHosts: ["connect.example.com"] })),
    ).toBe("url_self")
    // …and it is dropped from the normalised value, matching the server, so the
    // URL previewed here is byte-for-byte the one the control plane stores.
    expect(validateBaseUrl("https://api.example.com./v1")).toEqual({
      ok: true,
      value: "https://api.example.com/v1",
    })
  })
})

describe("validateSealedToken", () => {
  test("accepts a v1 envelope", () => {
    expect(validateSealedToken(` ${SEALED} `)).toEqual({ ok: true, value: SEALED })
  })

  test.each<[string, string, FieldIssue]>([
    ["nothing", "  ", "token_empty"],
    ["a raw bearer token", "sk-live-9f8a7b6c5d4e3f2a1b0c", "token_not_sealed"],
    ["a raw gateway key", "cgk_key_ab12_a1b2c3d4e5f60718293a4b5c6d7e8f90", "token_not_sealed"],
    ["a future version", SEALED.replace("v1.", "v2."), "token_not_sealed"],
    ["a truncated envelope", "v1.SGVsbG9Xb3JsZDEy", "token_not_sealed"],
    ["base64 padding, which base64url has none of", "v1.SGVsbG9Xb3JsZDEy.YWJjZGVmZ2hpamts=", "token_not_sealed"],
    ["a wrong-length iv", "v1.SGVsbG8.YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo", "token_not_sealed"],
  ])("rejects %s", (_name, value, issue) => {
    expect(issueOf(validateSealedToken(value))).toBe(issue)
  })
})

describe("validateConnectionForm", () => {
  const good = {
    connectorId: "careerpack",
    baseUrl: "https://careerpack.example.com/",
    tokenCipher: SEALED,
  }

  test("returns the normalised values", () => {
    expect(validateConnectionForm(good)).toEqual({
      ok: true,
      value: {
        connectorId: "careerpack",
        baseUrl: "https://careerpack.example.com",
        tokenCipher: SEALED,
      },
    })
  })

  test("reports the first failing field in reading order", () => {
    expect(validateConnectionForm({ ...good, connectorId: "", baseUrl: "nope" })).toEqual({
      ok: false,
      field: "connectorId",
      issue: "connector_empty",
    })
    expect(validateConnectionForm({ ...good, baseUrl: "http://api.example.com" })).toEqual({
      ok: false,
      field: "baseUrl",
      issue: "url_scheme",
    })
    expect(validateConnectionForm({ ...good, tokenCipher: "raw-token" })).toEqual({
      ok: false,
      field: "tokenCipher",
      issue: "token_not_sealed",
    })
  })
})
