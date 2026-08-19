import { describe, expect, test } from "bun:test"
import { normalizeOAuthApplicationType, OAUTH_APPLICATION_TYPES } from "./oauth-client"

describe("OAuth client metadata", () => {
  test("accepts the two RFC 7591 application types", () => {
    for (const value of OAUTH_APPLICATION_TYPES) {
      expect(normalizeOAuthApplicationType(value)).toBe(value)
    }
  })

  test.each([undefined, null, "desktop", "NATIVE", 1])("rejects unsupported type %j", (value) => {
    expect(normalizeOAuthApplicationType(value)).toBeNull()
  })
})
