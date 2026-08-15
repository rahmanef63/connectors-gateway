/**
 * Prerequisite checks: does the caller hold the scopes, and does the paired
 * device actually expose the capability, that the action declares.
 */
import type { ActionDefinition } from "@cg/core"

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string")
}

/** Device capabilities are namespaced per connector, e.g. `blender:scene.render`. */
export function qualifyCapability(connectorId: string, capability: string): string {
  const prefix = `${connectorId}:`
  return capability.startsWith(prefix) ? capability : prefix + capability
}

export function hasAllScopes(action: ActionDefinition, granted: unknown): boolean {
  const required = asStringArray(action.requiredScopes)
  if (required.length === 0) return true

  const held = new Set(asStringArray(granted))
  return required.every((scope) => held.has(scope))
}

/**
 * A device that announced nothing proves nothing: when an action requires a
 * capability and no capability report is present, the answer is "no".
 */
export function hasAllCapabilities(
  connectorId: string,
  action: ActionDefinition,
  announced: unknown,
): boolean {
  const required = asStringArray(action.requiredCapabilities)
  if (required.length === 0) return true

  const present = new Set(asStringArray(announced))
  return required.every((capability) => present.has(qualifyCapability(connectorId, capability)))
}
