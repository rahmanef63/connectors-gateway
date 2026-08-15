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

  test("resolves a known action", () => {
    expect(resolveTool("careerpack.profile.read")).toBe("get_profile")
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
