// @vitest-environment node
import { describe, expect, test } from "vitest"

import { readApiKeyView, readApiKeyViews, readIssuedKey } from "../read"

/** Shaped exactly like `formatToken("cgk", keyId, secret)` in packages/auth. */
const KEY_ID = "key_ab12cd34"
const SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90"
const TOKEN = `cgk_${KEY_ID}_${SECRET}`

describe("readIssuedKey", () => {
  test("reads a bare token string", () => {
    expect(readIssuedKey(TOKEN)).toEqual({ token: TOKEN, keyId: KEY_ID })
  })

  test.each(["token", "key", "apiKey", "secret", "value"])(
    "reads the token from a `%s` field",
    (field) => {
      expect(readIssuedKey({ [field]: TOKEN, keyId: KEY_ID })).toEqual({
        token: TOKEN,
        keyId: KEY_ID,
      })
    },
  )

  test("finds a token under a field name we did not predict", () => {
    expect(readIssuedKey({ plaintextCredential: TOKEN })).toEqual({ token: TOKEN, keyId: KEY_ID })
  })

  test("derives the key id from the token, not from a sibling field", () => {
    // A mismatched `keyId` field must not win: the token is the only value the
    // user will paste, so the row they revoke has to be the one it names.
    expect(readIssuedKey({ token: TOKEN, keyId: "key_somethingelse" })?.keyId).toBe(KEY_ID)
  })

  test.each<[string, unknown]>([
    ["null", null],
    ["a number", 42],
    ["an array", [TOKEN]],
    ["an empty object", {}],
    ["a device credential (wrong prefix)", { token: `cgd_${KEY_ID}_${SECRET}` }],
    ["a truncated secret", { token: `cgk_${KEY_ID}_short` }],
    ["a token with no id part", { token: `cgk__${SECRET}` }],
    ["a placeholder", { token: "PASTE_YOUR_GATEWAY_API_KEY_HERE" }],
  ])("returns null for %s", (_name, value) => {
    expect(readIssuedKey(value)).toBeNull()
  })
})

describe("readApiKeyView", () => {
  test("reads a full row", () => {
    expect(
      readApiKeyView({
        keyId: KEY_ID,
        label: "Claude Desktop",
        status: "active",
        createdAt: 1_700_000_000_000,
        lastUsedAt: 1_700_000_060_000,
      }),
    ).toEqual({
      keyId: KEY_ID,
      label: "Claude Desktop",
      status: "active",
      createdAt: 1_700_000_000_000,
      lastUsedAt: 1_700_000_060_000,
    })
  })

  test("accepts `id` as the key id, which is what @cg/auth calls it", () => {
    expect(readApiKeyView({ id: KEY_ID, status: "active" })?.keyId).toBe(KEY_ID)
  })

  test("falls back to Convex's own _creationTime", () => {
    expect(readApiKeyView({ keyId: KEY_ID, _creationTime: 123 })?.createdAt).toBe(123)
  })

  test("a missing label is empty, not invented copy", () => {
    expect(readApiKeyView({ keyId: KEY_ID })?.label).toBe("")
  })

  test("an unreadable status is `unknown`, never blank", () => {
    expect(readApiKeyView({ keyId: KEY_ID, status: 7 })?.status).toBe("unknown")
  })

  test.each<[string, unknown]>([
    ["a row with no id at all", { label: "x" }],
    ["a string", "row"],
    ["null", null],
  ])("drops %s", (_name, row) => {
    expect(readApiKeyView(row)).toBeNull()
  })
})

describe("readApiKeyViews", () => {
  test("drops unusable rows and sorts newest first", () => {
    const views = readApiKeyViews([
      { keyId: "old", createdAt: 1 },
      { label: "no id" },
      { keyId: "new", createdAt: 9 },
      null,
      { keyId: "middle", createdAt: 5 },
    ])
    expect(views.map((view) => view.keyId)).toEqual(["new", "middle", "old"])
  })

  test("a non-array is an empty list, never a crash", () => {
    expect(readApiKeyViews(undefined)).toEqual([])
    expect(readApiKeyViews({ rows: [] })).toEqual([])
  })
})
