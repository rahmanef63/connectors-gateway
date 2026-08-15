import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { hasScopes, requireScopes } from "./scopes"

describe("hasScopes", () => {
  test("exact matches", () => {
    expect(hasScopes(["connector:blender"], ["connector:blender"])).toBe(true)
    expect(hasScopes(["a", "b"], ["a", "b"])).toBe(true)
    expect(hasScopes(["a", "b"], [])).toBe(true)
  })

  test("root wildcard grants everything", () => {
    expect(hasScopes(["*"], ["connector:blender.scene.render"])).toBe(true)
    expect(hasScopes(["*"], ["a", "b", "c"])).toBe(true)
  })

  test("prefix wildcard grants its namespace", () => {
    expect(hasScopes(["connector:*"], ["connector:blender"])).toBe(true)
    expect(hasScopes(["connector:*"], ["connector:blender.scene.render"])).toBe(true)
    expect(hasScopes(["connector:blender.*"], ["connector:blender.scene.render"])).toBe(true)
    expect(hasScopes(["connector:*", "admin:read"], ["connector:x", "admin:read"])).toBe(true)
  })

  test("DENIED: outside the granted namespace", () => {
    expect(hasScopes(["connector:*"], ["admin:read"])).toBe(false)
    expect(hasScopes(["connector:blender.*"], ["connector:careerpack.apply"])).toBe(false)
    expect(hasScopes(["connector:blender"], ["connector:blender.scene.render"])).toBe(false)
    expect(hasScopes([], ["connector:blender"])).toBe(false)
    expect(hasScopes(["connector:blender"], ["connector:blender", "admin:read"])).toBe(false)
  })

  test("DENIED: a wildcard does not straddle the namespace separator", () => {
    expect(hasScopes(["connector:*"], ["connectorx:read"])).toBe(false)
  })

  test("DENIED: required wildcard needs an equally broad grant", () => {
    expect(hasScopes(["connector:blender"], ["connector:*"])).toBe(false)
    expect(hasScopes(["connector:*"], ["connector:*"])).toBe(true)
    expect(hasScopes(["*"], ["connector:*"])).toBe(true)
  })

  test("DENIED: malformed input", () => {
    expect(hasScopes(["*"], ["" as string])).toBe(false)
    expect(hasScopes(["*"], [null as unknown as string])).toBe(false)
    expect(hasScopes(null as unknown as string[], ["a"])).toBe(false)
    expect(hasScopes(["a"], "a" as unknown as string[])).toBe(false)
    expect(hasScopes([42 as unknown as string], ["42"])).toBe(false)
  })
})

describe("requireScopes", () => {
  test("passes silently when covered", () => {
    expect(() => requireScopes(["*"], ["connector:blender"])).not.toThrow()
  })

  test("DENIED: throws NOT_AUTHORIZED", () => {
    try {
      requireScopes(["connector:blender"], ["admin:write"])
      throw new Error("expected a rejection")
    } catch (error) {
      expect(error).toBeInstanceOf(GatewayError)
      expect((error as GatewayError).code).toBe("NOT_AUTHORIZED")
    }
  })
})
