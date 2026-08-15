import { describe, expect, test } from "bun:test"
import {
  actionIdFromToolName,
  createToolIndex,
  lookupTool,
  toolNameFor,
} from "./tool-names"

const ACTION_IDS = [
  "blender.scene.render",
  "blender.object.create",
  "careerpack.application.create",
  "careerpack.profile.read",
]

describe("tool name mapping", () => {
  test("dots become underscores", () => {
    expect(toolNameFor("blender.scene.render")).toBe("blender_scene_render")
  })

  test("round-trips for every built-in action id", () => {
    for (const actionId of ACTION_IDS) {
      expect(actionIdFromToolName(toolNameFor(actionId))).toBe(actionId)
    }
  })

  test("an action id containing an underscore is refused rather than mangled", () => {
    expect(() => toolNameFor("blender.scene_render")).toThrow()
  })

  test("an empty or over-long action id is refused", () => {
    expect(() => toolNameFor("")).toThrow()
    expect(() => toolNameFor("a".repeat(200))).toThrow()
  })

  test("a tool name with illegal characters is ACTION_NOT_FOUND, not a lookup", () => {
    expect(() => actionIdFromToolName("../../etc/passwd")).toThrow()
    expect(() => actionIdFromToolName("blender scene")).toThrow()
  })
})

describe("lookupTool", () => {
  const index = createToolIndex([
    { connectorId: "blender", actionId: "blender.scene.render" },
    { connectorId: "careerpack", actionId: "careerpack.profile.read" },
  ])

  test("resolves a known tool to its connector and action", () => {
    expect(lookupTool(index, "blender_scene_render")).toEqual({
      connectorId: "blender",
      actionId: "blender.scene.render",
    })
  })

  test("an unknown tool never reaches the registry", () => {
    expect(() => lookupTool(index, "blender_python_execute")).toThrow("Unknown tool.")
  })

  test("a non-string name is refused", () => {
    expect(() => lookupTool(index, { toString: () => "blender_scene_render" })).toThrow()
    expect(() => lookupTool(index, undefined)).toThrow()
  })

  test("prototype keys do not resolve through the map", () => {
    expect(() => lookupTool(index, "toString")).toThrow()
    expect(() => lookupTool(index, "constructor")).toThrow()
  })
})
