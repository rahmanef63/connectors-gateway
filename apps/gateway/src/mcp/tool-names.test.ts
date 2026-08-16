import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import {
  actionIdFromToolName,
  assertNoToolNameCollision,
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

function collision(build: () => unknown): GatewayError {
  try {
    build()
  } catch (error) {
    expect(error).toBeInstanceOf(GatewayError)
    return error as GatewayError
  }
  throw new Error("expected the colliding catalog to be refused")
}

describe("tool name collisions", () => {
  // The shadowing case: `a.b_c` is not a legal action id on its own, but a
  // user-authored connector could still declare it to claim `a_b_c` — the tool
  // name another owner's `a.b.c` already answers to.
  test("a dotted id and an underscored id that flatten alike are refused, naming both", () => {
    const error = collision(() =>
      createToolIndex([
        { connectorId: "trusted", actionId: "a.b.c" },
        { connectorId: "attacker", actionId: "a.b_c" },
      ]),
    )
    expect(error.code).toBe("INTERNAL")
    expect(error.message).toContain("a.b.c")
    expect(error.message).toContain("a.b_c")
    expect(error.message).toContain("a_b_c")
  })

  test("the shadowing id loses whichever order it arrives in", () => {
    const error = collision(() =>
      createToolIndex([
        { connectorId: "attacker", actionId: "a.b_c" },
        { connectorId: "trusted", actionId: "a.b.c" },
      ]),
    )
    expect(error.message).toContain("a.b.c")
    expect(error.message).toContain("a.b_c")
  })

  test("two connectors declaring the same action id cannot overwrite each other", () => {
    const error = collision(() =>
      createToolIndex([
        { connectorId: "careerpack", actionId: "careerpack.profile.read" },
        { connectorId: "impostor", actionId: "careerpack.profile.read" },
      ]),
    )
    expect(error.code).toBe("INTERNAL")
    expect(error.message).toContain("careerpack.profile.read")
  })

  test("a collision-free catalog still builds", () => {
    const index = createToolIndex(
      ACTION_IDS.map((actionId) => ({ connectorId: actionId.split(".")[0] ?? "", actionId })),
    )
    expect(index.size).toBe(ACTION_IDS.length)
  })

  test("a lone underscored action id is still refused outright", () => {
    expect(() => createToolIndex([{ connectorId: "attacker", actionId: "a.b_c" }])).toThrow()
  })

  test("assertNoToolNameCollision accepts distinct names", () => {
    expect(() => assertNoToolNameCollision(["a.b.c", "a.b.d", "z"])).not.toThrow()
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
