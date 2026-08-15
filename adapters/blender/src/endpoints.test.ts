import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { ACTION_SCENE_RENDER } from "./action-ids"
import { BRIDGE_ENDPOINTS, endpointFor } from "./endpoints"

describe("endpointFor", () => {
  test("resolves a declared action", () => {
    expect(endpointFor(ACTION_SCENE_RENDER)).toBe("/scene/render")
  })

  test("an unknown action id is ACTION_NOT_FOUND", () => {
    expect(() => endpointFor("blender.nope")).toThrow(GatewayError)
  })

  /**
   * Regression: the lookup was a bare index, so an inherited Object.prototype
   * member resolved to a non-endpoint value instead of throwing.
   */
  test("a prototype member is not an endpoint", () => {
    for (const key of ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"]) {
      expect(() => endpointFor(key)).toThrow("This Blender action does not exist.")
    }
  })

  test("the table itself exposes only own keys", () => {
    expect(Object.keys(BRIDGE_ENDPOINTS).every((key) => key.startsWith("blender."))).toBe(true)
  })
})
