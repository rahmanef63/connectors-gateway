/**
 * Shared JSON Schema fragments and bounds for the Blender manifest.
 * Every bound exists to keep prompt-injected input inside a survivable range
 * (docs/14: "malicious connector input", "prompt injection causes destructive action").
 */
import type { JsonSchema } from "@cg/core"

export const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"

/** Blender datablock names are 63 bytes; anything longer is truncated by Blender anyway. */
export const MAX_NAME_LENGTH = 63
/** No legitimate MVP scene edit needs coordinates beyond this. */
export const COORD_LIMIT = 10_000
export const MAX_LIST_ITEMS = 500

/** Datablock names: no path separators, no null bytes, no control characters. */
export const NAME_PATTERN = "^[A-Za-z0-9 ._-]{1,63}$"

export const OBJECT_TYPES = ["MESH", "CURVE", "EMPTY", "CAMERA", "LIGHT", "ARMATURE"] as const
export const PRIMITIVE_TYPES = ["CUBE", "SPHERE", "PLANE", "CYLINDER", "CONE", "TORUS"] as const
export const RENDER_FORMATS = ["PNG", "JPEG", "OPEN_EXR"] as const
export const EXPORT_FORMATS = ["GLB", "GLTF", "OBJ", "FBX", "STL"] as const

export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number]
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export function nameSchema(description: string): JsonSchema {
  return {
    type: "string",
    minLength: 1,
    maxLength: MAX_NAME_LENGTH,
    pattern: NAME_PATTERN,
    description,
  }
}

export function vector3Schema(description: string): JsonSchema {
  return {
    type: "array",
    items: { type: "number", minimum: -COORD_LIMIT, maximum: COORD_LIMIT },
    minItems: 3,
    maxItems: 3,
    description,
  }
}

export function limitSchema(description: string): JsonSchema {
  return { type: "integer", minimum: 1, maximum: MAX_LIST_ITEMS, description }
}

/** Wraps a property bag into a closed object schema — unknown keys are always rejected. */
export function objectSchema(
  properties: Record<string, JsonSchema>,
  required: readonly string[] = [],
): JsonSchema {
  const schema: JsonSchema = {
    $schema: JSON_SCHEMA_DIALECT,
    type: "object",
    properties,
    additionalProperties: false,
  }
  if (required.length > 0) schema["required"] = [...required]
  return schema
}
