import { describe, expect, test } from "bun:test"
import { isIdentityKey, normalizeKey, stripIdentityFields } from "./identity"

describe("normalizeKey", () => {
  test("case, underscores and dashes collapse", () => {
    expect(normalizeKey("user_id")).toBe("userid")
    expect(normalizeKey("User-Id")).toBe("userid")
    expect(normalizeKey("USERID")).toBe("userid")
  })
})

describe("isIdentityKey", () => {
  test("recognises every spelling of the forbidden fields (docs/05)", () => {
    for (const key of [
      "user_id",
      "userId",
      "workspace_id",
      "workspaceId",
      "device_id",
      "deviceId",
      "principal",
      "actorId",
      "callerId",
      "scopes",
      "policy",
      "requestContext",
      "onBehalfOf",
      "tenant_id",
      "org_id",
    ]) {
      expect(isIdentityKey(key)).toBe(true)
    }
  })

  test("leaves legitimate business fields alone", () => {
    for (const key of ["role", "company", "status", "notes", "name", "user", "device", "sceneName"]) {
      expect(isIdentityKey(key)).toBe(false)
    }
  })
})

describe("stripIdentityFields", () => {
  test("removes identity keys and reports which ones", () => {
    const result = stripIdentityFields({ user_id: "usr_x", role: "Engineer" })
    expect(result.input).toEqual({ role: "Engineer" })
    expect(result.stripped).toEqual(["userid"])
  })

  test("the reported field list never contains the value", () => {
    const result = stripIdentityFields({ userId: "usr_secret_value" })
    expect(result.stripped.join(",")).not.toContain("secret")
  })

  test("non-object input passes through untouched", () => {
    expect(stripIdentityFields("hello").input).toBe("hello")
    expect(stripIdentityFields([1, 2]).input).toEqual([1, 2])
    expect(stripIdentityFields(null).input).toBeNull()
  })

  test("an untouched object is still copied, not aliased", () => {
    const original = { keep: 1 }
    const result = stripIdentityFields(original)
    expect(result.input).toEqual(original)
    expect(result.input).not.toBe(original)
  })

  /**
   * Regression: the accumulator used to be a plain `{}`, so copying an own
   * `__proto__` key (which `JSON.parse` produces) reassigned the prototype of
   * the very object handed to the adapter.
   */
  test("a caller-supplied __proto__ cannot become the adapter object's prototype", () => {
    const hostile = JSON.parse('{"__proto__":{"isAdmin":true},"keep":1}') as unknown
    const result = stripIdentityFields(hostile)
    const out = result.input as Record<string, unknown>

    expect(Object.getPrototypeOf(out)).toBeNull()
    expect(out["isAdmin"]).toBeUndefined()
    expect(out["keep"]).toBe(1)
    // Nothing global was touched either.
    expect(({} as Record<string, unknown>)["isAdmin"]).toBeUndefined()
  })
})
