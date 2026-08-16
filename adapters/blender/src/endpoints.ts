/**
 * Action id -> bridge endpoint. A closed table: an action id that is not a key here
 * can never reach the bridge, whatever the caller sends.
 */
import { GatewayError } from "@cg/core"
import {
  ACTION_FILE_EXPORT,
  ACTION_MATERIAL_APPLY,
  ACTION_MATERIAL_LIST,
  ACTION_OBJECT_CREATE,
  ACTION_OBJECT_LIST,
  ACTION_OBJECT_TRANSFORM,
  ACTION_SCENE_INSPECT,
  ACTION_SCENE_RENDER,
} from "./action-ids"

export const HEALTH_ENDPOINT = "/health"

export const BRIDGE_ENDPOINTS: Readonly<Record<string, string>> = Object.freeze({
  [ACTION_SCENE_INSPECT]: "/scene/inspect",
  [ACTION_OBJECT_LIST]: "/object/list",
  [ACTION_MATERIAL_LIST]: "/material/list",
  [ACTION_OBJECT_CREATE]: "/object/create",
  [ACTION_OBJECT_TRANSFORM]: "/object/transform",
  [ACTION_MATERIAL_APPLY]: "/material/apply",
  [ACTION_SCENE_RENDER]: "/scene/render",
  [ACTION_FILE_EXPORT]: "/file/export",
})

/**
 * Own-key lookup only. A bare index would resolve `constructor`, `toString` and
 * friends through Object.prototype and hand a non-endpoint to the bridge client.
 */
export function endpointFor(actionId: string): string {
  const endpoint = Object.hasOwn(BRIDGE_ENDPOINTS, actionId) ? BRIDGE_ENDPOINTS[actionId] : undefined
  if (typeof endpoint !== "string") {
    throw new GatewayError("ACTION_NOT_FOUND", "This Blender action does not exist.")
  }
  return endpoint
}
