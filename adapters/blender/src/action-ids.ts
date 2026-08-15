/**
 * Stable action ids for the Blender connector, in one place so the manifest,
 * the endpoint table and the output normalizer can never drift apart.
 */

export const BLENDER_CONNECTOR_ID = "blender"

export const ACTION_SCENE_INSPECT = "blender.scene.inspect"
export const ACTION_OBJECT_LIST = "blender.object.list"
export const ACTION_MATERIAL_LIST = "blender.material.list"
export const ACTION_OBJECT_CREATE = "blender.object.create"
export const ACTION_OBJECT_TRANSFORM = "blender.object.transform"
export const ACTION_MATERIAL_APPLY = "blender.material.apply"
export const ACTION_SCENE_RENDER = "blender.scene.render"
export const ACTION_FILE_EXPORT = "blender.file.export"

/** Actions whose result is a produced file rather than plain scene data. */
export const FILE_PRODUCING_ACTIONS: readonly string[] = Object.freeze([
  ACTION_SCENE_RENDER,
  ACTION_FILE_EXPORT,
])
