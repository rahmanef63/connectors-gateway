/**
 * Scope matching for AI-client API keys.
 * Scopes are colon/dot namespaced, e.g. `connector:blender.scene.render`.
 * Wildcards: `*` (everything) and any trailing `*` prefix such as `connector:*`.
 */
import { GatewayError } from "@cg/core"

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function scopeMatches(granted: string, required: string): boolean {
  if (granted === "*") return true
  if (granted === required) return true
  if (!granted.endsWith("*")) return false
  const prefix = granted.slice(0, -1)
  // A bare `*` is handled above; a prefix wildcard must keep its namespace
  // separator so `connector:*` cannot match `connectorx:read`.
  return prefix.length > 0 && required.startsWith(prefix)
}

/** True only when EVERY required scope is covered. Malformed input denies. */
export function hasScopes(granted: readonly string[], required: readonly string[]): boolean {
  if (!Array.isArray(granted) || !Array.isArray(required)) return false
  if (!required.every(isNonEmptyString)) return false
  const have = granted.filter(isNonEmptyString)
  return required.every((scope) => have.some((entry) => scopeMatches(entry, scope)))
}

/** Throwing form for handler code — the message never names the missing scope's value owner. */
export function requireScopes(granted: readonly string[], required: readonly string[]): void {
  if (!hasScopes(granted, required)) {
    throw new GatewayError("NOT_AUTHORIZED", "This credential is missing a required scope.", {
      required: [...required],
    })
  }
}
