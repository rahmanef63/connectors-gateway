/**
 * R0 read-only Blender actions. These never mutate the .blend file, so they are
 * auto-allowed by DEFAULT_RISK_DECISION (docs/03 risk table).
 */
import type { ActionDefinition } from "@cg/core"
import { defineAction } from "@cg/sdk"
import { ACTION_MATERIAL_LIST, ACTION_OBJECT_LIST, ACTION_SCENE_INSPECT } from "./action-ids"
import { limitSchema, objectSchema, OBJECT_TYPES } from "./schema-parts"

const READ_ONLY = { readOnly: true, destructive: false, idempotent: true } as const

export const sceneInspect: ActionDefinition = defineAction({
  id: ACTION_SCENE_INSPECT,
  title: "Inspect Blender scene",
  description: "Return a structured summary of the current Blender scene.",
  inputSchema: objectSchema({
    includeObjects: {
      type: "boolean",
      description: "Include the per-object list, not just scene totals.",
    },
    maxObjects: limitSchema("Upper bound on objects returned, so a huge scene cannot flood the model context."),
  }),
  outputSchema: objectSchema(
    {
      sceneName: { type: "string" },
      frameCurrent: { type: "integer" },
      objectCount: { type: "integer", minimum: 0 },
      objects: {
        type: "array",
        items: objectSchema({ name: { type: "string" }, type: { type: "string" } }, ["name", "type"]),
      },
    },
    ["sceneName", "objectCount"],
  ),
  risk: "R0",
  annotations: READ_ONLY,
  requiredCapabilities: ["scene.inspect"],
})

export const objectList: ActionDefinition = defineAction({
  id: ACTION_OBJECT_LIST,
  title: "List Blender objects",
  description: "List objects in the current scene, optionally filtered by object type.",
  inputSchema: objectSchema({
    type: {
      type: "string",
      enum: [...OBJECT_TYPES],
      description: "Only return objects of this Blender type.",
    },
    maxObjects: limitSchema("Upper bound on objects returned."),
  }),
  outputSchema: objectSchema(
    {
      objectCount: { type: "integer", minimum: 0 },
      objects: {
        type: "array",
        items: objectSchema(
          {
            name: { type: "string" },
            type: { type: "string" },
            location: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
            visible: { type: "boolean" },
          },
          ["name", "type"],
        ),
      },
    },
    ["objectCount", "objects"],
  ),
  risk: "R0",
  annotations: READ_ONLY,
  requiredCapabilities: ["object.list"],
})

export const materialList: ActionDefinition = defineAction({
  id: ACTION_MATERIAL_LIST,
  title: "List Blender materials",
  description: "List the materials present in the open Blender file.",
  inputSchema: objectSchema({
    maxMaterials: limitSchema("Upper bound on materials returned."),
  }),
  outputSchema: objectSchema(
    {
      materialCount: { type: "integer", minimum: 0 },
      materials: {
        type: "array",
        items: objectSchema(
          { name: { type: "string" }, users: { type: "integer", minimum: 0 } },
          ["name"],
        ),
      },
    },
    ["materialCount", "materials"],
  ),
  risk: "R0",
  annotations: READ_ONLY,
  requiredCapabilities: ["material.list"],
})

export const READ_ACTIONS: readonly ActionDefinition[] = Object.freeze([
  sceneInspect,
  objectList,
  materialList,
])
