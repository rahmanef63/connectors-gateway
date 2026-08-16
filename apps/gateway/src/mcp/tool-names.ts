/**
 * Action id <-> MCP tool name.
 *
 * MCP tool names are a flat, restricted namespace; connector action ids are
 * dotted (`blender.scene.render`). The mapping is a pure character swap so it
 * round-trips: `blender.scene.render` <-> `blender_scene_render`.
 *
 * Nothing routes on the reverse mapping alone — `lookupTool` resolves against
 * the caller's own catalog, so an invented tool name cannot reach the pipeline.
 */
import { GatewayError } from "@cg/core"

export const TOOL_NAME_RE = /^[A-Za-z0-9_-]{1,128}$/
/** Action ids may not contain `_`, or the mapping would stop round-tripping. */
export const ACTION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,127}$/

export function toolNameFor(actionId: string): string {
  if (!ACTION_ID_RE.test(actionId)) {
    throw new GatewayError("INTERNAL", "An action id cannot be exposed as an MCP tool name.")
  }
  return actionId.replaceAll(".", "_")
}

export function actionIdFromToolName(toolName: string): string {
  if (!TOOL_NAME_RE.test(toolName)) {
    throw new GatewayError("ACTION_NOT_FOUND", "Unknown tool.")
  }
  return toolName.replaceAll("_", ".")
}

export type ToolTarget = { connectorId: string; actionId: string }
export type ToolIndex = ReadonlyMap<string, ToolTarget>

/**
 * The name an action id flattens to, whether or not the id is legal.
 *
 * Collision detection must see ids `toolNameFor` would refuse: `a.b_c` is
 * exactly how a second connector would shadow `a.b.c` in a catalog, and the
 * useful failure names both, not just "this id is unusable".
 */
function flatName(actionId: string): string {
  return actionId.replaceAll(".", "_")
}

/**
 * Two actions may never claim one MCP tool name. Silently overwriting would let
 * a user-authored connector shadow another's tool in the catalog, so this is a
 * hard, named failure at catalog-build time rather than a last-writer-wins map.
 */
export function assertNoToolNameCollision(actionIds: readonly string[]): void {
  const claimedBy = new Map<string, string>()
  for (const actionId of actionIds) {
    const name = flatName(actionId)
    const first = claimedBy.get(name)
    if (first !== undefined) {
      throw new GatewayError(
        "INTERNAL",
        `MCP tool name "${name}" is claimed by two actions: "${first}" and "${actionId}".`,
      )
    }
    claimedBy.set(name, actionId)
  }
}

export function createToolIndex(targets: readonly ToolTarget[]): ToolIndex {
  assertNoToolNameCollision(targets.map((target) => target.actionId))

  const index = new Map<string, ToolTarget>()
  for (const target of targets) index.set(toolNameFor(target.actionId), target)
  return index
}

/** Unknown names are rejected here, never forwarded to the registry. */
export function lookupTool(index: ToolIndex, toolName: unknown): ToolTarget {
  if (typeof toolName !== "string" || !TOOL_NAME_RE.test(toolName)) {
    throw new GatewayError("ACTION_NOT_FOUND", "Unknown tool.")
  }
  const target = index.get(toolName)
  if (!target) throw new GatewayError("ACTION_NOT_FOUND", "Unknown tool.")
  return target
}
