/** Public surface of the Blender local adapter. */
export {
  DEFAULT_BRIDGE_URL,
  DEFAULT_EXPORT_ROOT,
  blenderAdapter,
  createBlenderAdapter,
} from "./adapter"
export type { BlenderAdapterOptions } from "./adapter"
export {
  ACTION_FILE_EXPORT,
  ACTION_MATERIAL_APPLY,
  ACTION_MATERIAL_LIST,
  ACTION_OBJECT_CREATE,
  ACTION_OBJECT_LIST,
  ACTION_OBJECT_TRANSFORM,
  ACTION_SCENE_INSPECT,
  ACTION_SCENE_RENDER,
  BLENDER_CONNECTOR_ID,
} from "./action-ids"
export { BLENDER_ADAPTER_VERSION, BLENDER_CAPABILITIES, manifest } from "./manifest"
export { BRIDGE_ENDPOINTS, HEALTH_ENDPOINT, endpointFor } from "./endpoints"
export { BridgeClient, DEFAULT_BRIDGE_TIMEOUT_MS, assertLoopback } from "./bridge-client"
export { MAX_EXPORT_NAME_LENGTH, resolveExportPath, toRelativeExportName, toSafeOutput } from "./paths"
export { normalizeOutput } from "./normalize"
export type { NormalizedFile } from "./normalize"
export { EXPORT_FORMATS, PRIMITIVE_TYPES, RENDER_FORMATS } from "./schema-parts"
export type { ExportFormat, PrimitiveType } from "./schema-parts"
