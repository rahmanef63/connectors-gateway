// @vitest-environment node
import { describe, expect, test } from "vitest"

import { TONES } from "@/components/status-badge"
import {
  API_KEY_STATUS_TONES,
  formatCreated,
  formatLastUsed,
  isRevocable,
  keyReference,
  truncateMiddle,
} from "../format"
import type { ApiKeyView } from "../read"

const view = (over: Partial<ApiKeyView> = {}): ApiKeyView => ({
  keyId: "key_ab12cd34",
  label: "Claude Desktop",
  status: "active",
  createdAt: 1_700_000_000_000,
  lastUsedAt: undefined,
  ...over,
})

describe("truncateMiddle", () => {
  test("leaves a short value alone", () => {
    expect(truncateMiddle("key_ab12")).toBe("key_ab12")
  })

  test("keeps both ends of a long value", () => {
    const long = "key_0123456789abcdefghij"
    const shown = truncateMiddle(long)
    expect(shown.startsWith("key_012345")).toBe(true)
    expect(shown.endsWith("ghij")).toBe(true)
    expect(shown.length).toBeLessThan(long.length)
  })
})

describe("keyReference", () => {
  test("renders the public head of the token", () => {
    expect(keyReference("key_ab12")).toBe("cgk_key_ab12_…")
  })

  test("DENIED: it can only ever show the id half", () => {
    // Even handed a whole token by mistake, the secret cannot survive: the id
    // is truncated in the middle and everything after it is an ellipsis.
    const secret = "a1b2c3d4e5f60718293a4b5c6d7e8f90"
    const shown = keyReference(`key_ab12cd34_${secret}`)
    expect(shown).not.toContain(secret)
    expect(shown).not.toContain(secret.slice(0, 12))
    expect(shown.endsWith("_…")).toBe(true)
  })
})

describe("API_KEY_STATUS_TONES", () => {
  test("covers the control plane's whole status vocabulary", () => {
    // Mirrors convex/_shared/validators.ts `apiKeyStatusValidator`.
    expect(Object.keys(API_KEY_STATUS_TONES).sort()).toEqual(["active", "expired", "revoked"])
  })

  test("names only tones the app's tone SSOT defines", () => {
    for (const tone of Object.values(API_KEY_STATUS_TONES)) {
      expect(TONES).toContain(tone)
    }
  })
})

describe("isRevocable", () => {
  test("only an active key offers the destructive action", () => {
    expect(isRevocable(view({ status: "active" }))).toBe(true)
    expect(isRevocable(view({ status: "revoked" }))).toBe(false)
    expect(isRevocable(view({ status: "expired" }))).toBe(false)
    expect(isRevocable(view({ status: "unknown" }))).toBe(false)
  })
})

describe("timestamps", () => {
  test("created renders as absolute UTC, identically on every clock", () => {
    expect(formatCreated(1_700_000_000_000)).toBe("2023-11-14 22:13 UTC")
    expect(formatCreated(undefined)).toBe("unknown")
  })

  test("a key nothing has authenticated with says never", () => {
    expect(formatLastUsed(undefined)).toBe("never")
    expect(formatLastUsed(1_700_000_000_000)).toBe("2023-11-14 22:13 UTC")
  })
})
