import { describe, expect, test } from "bun:test"
import { findAction } from "@cg/core"
import { BRIDGE_ENDPOINTS } from "./endpoints"
import { BLENDER_CAPABILITIES, manifest } from "./manifest"

const EXPECTED_ACTIONS = [
  "blender.scene.inspect",
  "blender.object.list",
  "blender.material.list",
  "blender.object.create",
  "blender.object.transform",
  "blender.material.apply",
  "blender.scene.render",
  "blender.file.export",
]

describe("blender manifest", () => {
  test("is a local, device-authenticated connector", () => {
    expect(manifest.id).toBe("blender")
    expect(manifest.executor).toBe("local")
    expect(manifest.auth.type).toBe("device")
  })

  test("exposes exactly the safe MVP action surface", () => {
    expect(manifest.actions.map((action) => action.id)).toEqual(EXPECTED_ACTIONS)
  })

  test("no dangerous action exists at all — not even disabled (AGENTS.md invariant 7)", () => {
    const forbidden = ["python", "shell", "filesystem"]
    for (const action of manifest.actions) {
      for (const word of forbidden) {
        expect(action.id.toLowerCase()).not.toContain(word)
      }
    }
    expect(findAction(manifest, "blender.python.execute")).toBeUndefined()
    expect(findAction(manifest, "blender.shell.execute")).toBeUndefined()
    expect(findAction(manifest, "blender.filesystem.raw")).toBeUndefined()
  })

  test("every action carries risk metadata and a closed object input schema", () => {
    for (const action of manifest.actions) {
      expect(["R0", "R1", "R2", "R3", "R4"]).toContain(action.risk)
      expect(action.inputSchema["type"]).toBe("object")
      expect(action.inputSchema["additionalProperties"]).toBe(false)
      expect(action.requiredCapabilities?.length ?? 0).toBeGreaterThan(0)
      expect(action.title.length).toBeGreaterThan(0)
      expect(action.description.length).toBeGreaterThan(0)
    }
  })

  test("risk classes match the documented surface", () => {
    const risks = Object.fromEntries(manifest.actions.map((action) => [action.id, action.risk]))
    expect(risks["blender.scene.inspect"]).toBe("R0")
    expect(risks["blender.object.list"]).toBe("R0")
    expect(risks["blender.material.list"]).toBe("R0")
    expect(risks["blender.object.create"]).toBe("R1")
    expect(risks["blender.object.transform"]).toBe("R2")
    expect(risks["blender.material.apply"]).toBe("R2")
    expect(risks["blender.scene.render"]).toBe("R2")
    expect(risks["blender.file.export"]).toBe("R3")
  })

  test("only the R0 actions are read-only, and the export is the destructive one", () => {
    for (const action of manifest.actions) {
      expect(action.annotations.readOnly).toBe(action.risk === "R0")
    }
    expect(findAction(manifest, "blender.file.export")?.annotations.destructive).toBe(true)
  })

  test("every action has a bridge endpoint and every endpoint has an action", () => {
    const endpointKeys = Object.keys(BRIDGE_ENDPOINTS).sort()
    expect(endpointKeys).toEqual([...EXPECTED_ACTIONS].sort())
  })

  test("capability list is derived from the actions and has no duplicates", () => {
    expect(BLENDER_CAPABILITIES).toEqual([
      "scene.inspect",
      "object.list",
      "material.list",
      "object.create",
      "object.transform",
      "material.apply",
      "scene.render",
      "file.export",
    ])
    expect(new Set(BLENDER_CAPABILITIES).size).toBe(BLENDER_CAPABILITIES.length)
  })
})
