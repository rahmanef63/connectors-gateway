// @vitest-environment node
import { describe, expect, test } from "vitest"
import { countCapabilities, groupCapabilities, splitCapability } from "../lib/capabilities"

describe("splitCapability", () => {
  test("splits a namespaced capability on the first colon", () => {
    expect(splitCapability("blender:scene.render")).toEqual({ connector: "blender", capability: "scene.render" })
    expect(splitCapability("blender:a:b")).toEqual({ connector: "blender", capability: "a:b" })
  })

  test("treats a malformed namespace as unnamespaced", () => {
    expect(splitCapability("scene.render")).toEqual({ connector: null, capability: "scene.render" })
    expect(splitCapability(":scene.render")).toEqual({ connector: null, capability: ":scene.render" })
    expect(splitCapability("blender:")).toEqual({ connector: null, capability: "blender:" })
  })
})

describe("groupCapabilities", () => {
  test("groups by adapter and sorts inside each group", () => {
    expect(groupCapabilities(["blender:object.create", "blender:scene.render"])).toEqual([
      { connector: "blender", capabilities: ["object.create", "scene.render"] },
    ])
  })

  test("orders adapters alphabetically and puts unnamespaced last", () => {
    const groups = groupCapabilities(["orphan", "zeta:one", "alpha:one"])
    expect(groups.map((group) => group.connector)).toEqual(["alpha", "zeta", null])
  })

  test("de-duplicates a repeated announcement", () => {
    const groups = groupCapabilities(["blender:scene.render", "blender:scene.render"])
    expect(groups[0]?.capabilities).toEqual(["scene.render"])
  })

  test("DENIED: ignores entries that are not non-empty strings", () => {
    expect(groupCapabilities(["blender:scene.render", "", null, 7, { x: 1 }])).toEqual([
      { connector: "blender", capabilities: ["scene.render"] },
    ])
  })

  test("DENIED: anything that is not an array yields no groups", () => {
    expect(groupCapabilities(undefined)).toEqual([])
    expect(groupCapabilities("blender:scene.render")).toEqual([])
  })
})

describe("countCapabilities", () => {
  test("counts across groups", () => {
    expect(countCapabilities(groupCapabilities(["a:one", "a:two", "b:one", "loose"]))).toBe(4)
    expect(countCapabilities([])).toBe(0)
  })
})
