import { describe, expect, test } from "bun:test"
import type { ActionDefinition } from "@cg/core"
import { hasAllCapabilities, hasAllScopes, qualifyCapability } from "./requirements"

const action = (overrides: Partial<ActionDefinition>): ActionDefinition => ({
  id: "scene.render",
  title: "Render",
  description: "Render the scene.",
  inputSchema: {},
  risk: "R2",
  annotations: { readOnly: false, destructive: false },
  ...overrides,
})

describe("hasAllScopes", () => {
  test("an action requiring nothing is satisfied by nothing", () => {
    expect(hasAllScopes(action({}), [])).toBe(true)
  })

  test("all required scopes present", () => {
    const a = action({ requiredScopes: ["blender:read", "blender:write"] })
    expect(hasAllScopes(a, ["blender:write", "blender:read", "extra"])).toBe(true)
  })

  test("one missing scope is enough to fail", () => {
    const a = action({ requiredScopes: ["blender:read", "blender:write"] })
    expect(hasAllScopes(a, ["blender:read"])).toBe(false)
  })

  test("a non-array or dirty scope list does not accidentally satisfy", () => {
    const a = action({ requiredScopes: ["blender:read"] })
    expect(hasAllScopes(a, undefined)).toBe(false)
    expect(hasAllScopes(a, "blender:read")).toBe(false)
    expect(hasAllScopes(a, [{ scope: "blender:read" }])).toBe(false)
  })
})

describe("qualifyCapability", () => {
  test("namespaces a bare capability", () => {
    expect(qualifyCapability("blender", "scene.render")).toBe("blender:scene.render")
  })

  test("leaves an already-namespaced capability alone", () => {
    expect(qualifyCapability("blender", "blender:scene.render")).toBe("blender:scene.render")
  })
})

describe("hasAllCapabilities", () => {
  test("no requirement means no device report is needed", () => {
    expect(hasAllCapabilities("blender", action({}), undefined)).toBe(true)
  })

  test("matches against the namespaced capability", () => {
    const a = action({ requiredCapabilities: ["scene.render"] })
    expect(hasAllCapabilities("blender", a, ["blender:scene.render"])).toBe(true)
    expect(hasAllCapabilities("blender", a, ["scene.render"])).toBe(false)
  })

  test("a device that announced nothing satisfies nothing", () => {
    const a = action({ requiredCapabilities: ["scene.render"] })
    expect(hasAllCapabilities("blender", a, undefined)).toBe(false)
    expect(hasAllCapabilities("blender", a, [])).toBe(false)
  })

  test("another connector's capability does not count", () => {
    const a = action({ requiredCapabilities: ["scene.render"] })
    expect(hasAllCapabilities("blender", a, ["careerpack:scene.render"])).toBe(false)
  })
})
