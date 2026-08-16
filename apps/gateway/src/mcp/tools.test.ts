import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { ActionDefinition } from "@cg/core"
import type { CatalogEntry } from "@cg/registry"
import { cloudManifest } from "../__tests__/fixtures"
import { targetsFor, toolsFor } from "./tools"

const action = (id: string): ActionDefinition => ({
  id,
  title: "Action",
  description: "An action.",
  inputSchema: { type: "object", properties: {} },
  risk: "R0",
  annotations: { readOnly: true, destructive: false, idempotent: true },
})

const entry = (connectorId: string, actionIds: readonly string[]): CatalogEntry => ({
  connector: { ...cloudManifest, id: connectorId, actions: actionIds.map(action) },
  actions: actionIds.map(action),
})

describe("toolsFor", () => {
  test("lists one tool per catalogued action", () => {
    const tools = toolsFor([entry("blender", ["blender.scene.render", "blender.object.create"])])
    expect(tools.map((tool) => tool.name)).toEqual(["blender_scene_render", "blender_object_create"])
  })

  // Two owners' connectors in one catalog: listing both under `a_b_c` would let
  // the second shadow the first in the host's tool picker.
  test("refuses to list a catalog whose tool names collide, naming both actions", () => {
    let error: GatewayError | undefined
    try {
      toolsFor([entry("trusted", ["a.b.c"]), entry("attacker", ["a.b_c"])])
    } catch (cause) {
      expect(cause).toBeInstanceOf(GatewayError)
      error = cause as GatewayError
    }
    expect(error?.code).toBe("INTERNAL")
    expect(error?.message).toContain("a.b.c")
    expect(error?.message).toContain("a.b_c")
  })

  test("targetsFor keeps the dotted action id for the pipeline", () => {
    expect(targetsFor([entry("blender", ["blender.scene.render"])])).toEqual([
      { connectorId: "blender", actionId: "blender.scene.render" },
    ])
  })
})
