import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { manifest } from "./manifest"
import { UPSTREAM_TOOL, resolveTool } from "./upstream"

describe("upstream tool mapping", () => {
  test("maps every manifest action and nothing else", () => {
    const mapped = Object.keys(UPSTREAM_TOOL).sort()
    const declared = manifest.actions.map((action) => action.id).sort()
    expect(mapped).toEqual(declared)
  })

  test("upstream names stay snake_case", () => {
    for (const tool of Object.values(UPSTREAM_TOOL)) {
      expect(tool).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  /**
   * Transcribed from the live server's tool definitions, not from memory:
   * convex/mcp/tools/profile.ts declares `profile_get` and
   * convex/mcp/tools/applications.ts declares `applications_create`.
   * The connector originally shipped the verb-first spellings, which no CareerPack
   * deployment has ever published.
   */
  test("resolves to the tool names CareerPack actually publishes", () => {
    expect(resolveTool("careerpack.profile.read")).toBe("profile_get")
    expect(resolveTool("careerpack.application.create")).toBe("applications_create")
  })

  test("the verb-first spellings are gone for good", () => {
    expect(Object.values(UPSTREAM_TOOL)).not.toContain("get_profile")
    expect(Object.values(UPSTREAM_TOOL)).not.toContain("create_application")
  })

  test("an unknown action throws ACTION_NOT_FOUND without echoing the id", () => {
    let thrown: unknown
    try {
      resolveTool("careerpack.<script>.read")
    } catch (cause) {
      thrown = cause
    }
    expect(thrown).toBeInstanceOf(GatewayError)
    expect((thrown as GatewayError).code).toBe("ACTION_NOT_FOUND")
    expect((thrown as GatewayError).message).not.toContain("<script>")
  })

  test("a prototype key does not resolve to a tool", () => {
    expect(() => resolveTool("toString")).toThrow(GatewayError)
  })
})
