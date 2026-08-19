/**
 * Mutating Blender actions (R1..R3). Each one is a narrow, typed operation —
 * never a generic "run this in Blender" escape hatch (docs/03 "Safe actions
 * should be explicit, narrow tool calls").
 */
import { SCOPE_WRITE, type ActionDefinition } from "@cg/core"
import { defineAction } from "@cg/sdk"
import {
  ACTION_FILE_EXPORT,
  ACTION_MATERIAL_APPLY,
  ACTION_OBJECT_CREATE,
  ACTION_OBJECT_TRANSFORM,
  ACTION_SCENE_RENDER,
} from "./action-ids"
import {
  EXPORT_FORMATS,
  MAX_NAME_LENGTH,
  nameSchema,
  objectSchema,
  PRIMITIVE_TYPES,
  RENDER_FORMATS,
  vector3Schema,
} from "./schema-parts"

const fileOutputSchema = objectSchema(
  {
    file: objectSchema(
      {
        name: { type: "string", description: "Base name only — never a local filesystem path." },
        mimeType: { type: "string" },
        sizeBytes: { type: "integer", minimum: 0 },
      },
      ["name", "mimeType", "sizeBytes"],
    ),
    renderedFrame: { type: "integer" },
    durationMs: { type: "integer", minimum: 0 },
  },
  ["file"],
)

export const objectCreate: ActionDefinition = defineAction({
  id: ACTION_OBJECT_CREATE,
  title: "Create Blender object",
  description: "Add one primitive mesh object to the current scene.",
  inputSchema: objectSchema(
    {
      type: {
        type: "string",
        enum: [...PRIMITIVE_TYPES],
        description: "Primitive to add. The bridge maps this to a fixed operator, never to caller text.",
      },
      name: nameSchema("Optional name for the new object."),
      location: vector3Schema("World-space XYZ position of the new object."),
      size: { type: "number", exclusiveMinimum: 0, maximum: 1000, description: "Base size of the primitive." },
    },
    ["type"],
  ),
  outputSchema: objectSchema({ name: { type: "string" }, type: { type: "string" } }, ["name", "type"]),
  risk: "R1",
  annotations: { readOnly: false, destructive: false, idempotent: false },
  requiredScopes: [SCOPE_WRITE],
  requiredCapabilities: ["object.create"],
})

export const objectTransform: ActionDefinition = defineAction({
  id: ACTION_OBJECT_TRANSFORM,
  title: "Transform Blender object",
  description: "Set or offset the location, rotation and scale of one existing object.",
  inputSchema: objectSchema(
    {
      name: nameSchema("Name of the object to transform."),
      location: vector3Schema("Target (or delta, when relative) world-space XYZ position."),
      rotationEuler: vector3Schema("Target (or delta) XYZ Euler rotation in radians."),
      scale: vector3Schema("Target (or multiplier, when relative) XYZ scale."),
      relative: {
        type: "boolean",
        description: "Apply the values as deltas instead of absolute values.",
      },
    },
    ["name"],
  ),
  outputSchema: objectSchema({ name: { type: "string" }, applied: { type: "array", items: { type: "string" } } }, ["name"]),
  risk: "R2",
  annotations: { readOnly: false, destructive: false, idempotent: true },
  requiredScopes: [SCOPE_WRITE],
  requiredCapabilities: ["object.transform"],
})

export const materialApply: ActionDefinition = defineAction({
  id: ACTION_MATERIAL_APPLY,
  title: "Apply material to object",
  description: "Assign an existing material to an object, optionally creating a simple one first.",
  inputSchema: objectSchema(
    {
      objectName: nameSchema("Object that receives the material."),
      materialName: nameSchema("Material to assign."),
      createIfMissing: {
        type: "boolean",
        description: "Create a basic principled material when the name does not exist yet.",
      },
      baseColor: {
        type: "array",
        items: { type: "number", minimum: 0, maximum: 1 },
        minItems: 4,
        maxItems: 4,
        description: "RGBA base colour used only when a material is created.",
      },
    },
    ["objectName", "materialName"],
  ),
  outputSchema: objectSchema(
    { objectName: { type: "string" }, materialName: { type: "string" }, created: { type: "boolean" } },
    ["objectName", "materialName"],
  ),
  risk: "R2",
  annotations: { readOnly: false, destructive: false, idempotent: true },
  requiredScopes: [SCOPE_WRITE],
  requiredCapabilities: ["material.apply"],
})

export const sceneRender: ActionDefinition = defineAction({
  id: ACTION_SCENE_RENDER,
  title: "Render Blender scene",
  description: "Render the active Blender scene using explicit render settings.",
  inputSchema: objectSchema(
    {
      frame: { type: "integer", minimum: 0, maximum: 1_048_574 },
      resolutionX: { type: "integer", minimum: 16, maximum: 4096 },
      resolutionY: { type: "integer", minimum: 16, maximum: 4096 },
      samples: { type: "integer", minimum: 1, maximum: 1024 },
      format: { type: "string", enum: [...RENDER_FORMATS] },
    },
    ["resolutionX", "resolutionY"],
  ),
  // The output directory is chosen by the bridge; the caller cannot name a path.
  outputSchema: fileOutputSchema,
  risk: "R2",
  annotations: { readOnly: false, destructive: false, idempotent: false },
  requiredScopes: [SCOPE_WRITE],
  requiredCapabilities: ["scene.render"],
})

export const fileExport: ActionDefinition = defineAction({
  id: ACTION_FILE_EXPORT,
  title: "Export Blender scene to a file",
  description: "Export the scene to a supported interchange format inside the export root.",
  inputSchema: objectSchema(
    {
      fileName: {
        type: "string",
        minLength: 1,
        maxLength: MAX_NAME_LENGTH * 2,
        // Relative names only: no leading slash, no drive letter, no "..".
        pattern: "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9 ._-]*(/[A-Za-z0-9][A-Za-z0-9 ._-]*)*$",
        description: "Relative file name inside the export root. Absolute paths are rejected.",
      },
      format: { type: "string", enum: [...EXPORT_FORMATS] },
      selectedOnly: { type: "boolean", description: "Export only the selected objects." },
    },
    ["fileName", "format"],
  ),
  outputSchema: fileOutputSchema,
  // R3: this writes to disk and can overwrite an existing export (docs/03 risk table).
  risk: "R3",
  annotations: { readOnly: false, destructive: true, idempotent: false },
  requiredScopes: [SCOPE_WRITE],
  requiredCapabilities: ["file.export"],
})

export const WRITE_ACTIONS: readonly ActionDefinition[] = Object.freeze([
  objectCreate,
  objectTransform,
  materialApply,
  sceneRender,
  fileExport,
])
