/**
 * Normalized gateway action id -> the tool name the upstream MCP server publishes.
 *
 * The map is DATA: it lives on the action itself as `x-upstream`, so adding a connector
 * is a manifest, not a TypeScript file (docs/16-connector-strategy.md). The action `$def`
 * in packages/schemas/connector-manifest.schema.json describes the keyword and type-checks
 * it as a non-empty string wherever it appears.
 */
import { GatewayError, findAction } from "@cg/core"
import type { ConnectorManifest } from "@cg/core"

/** The manifest keyword carrying the upstream tool name for one action. */
export const UPSTREAM_KEY = "x-upstream"

/**
 * The upstream tool name for `actionId`, read from the manifest.
 *
 * An action with no `x-upstream` is ACTION_NOT_FOUND, never a name derived from the
 * action id: `careerpack.profile.read` -> `profile_read` is a plausible-looking guess and
 * the server publishes `profile_get`. A guess that resolves to a DIFFERENT existing tool
 * is worse than a 404 — it executes something the manifest never described.
 *
 * The caller-supplied id is never echoed into the message: it reaches an AI client.
 */
export function resolveUpstreamTool(manifest: ConnectorManifest, actionId: string): string {
  const action = findAction(manifest, actionId)
  if (action === undefined) throw notFound()

  const name: unknown = (action as Record<string, unknown>)[UPSTREAM_KEY]
  if (typeof name !== "string" || name.length === 0) throw notFound()
  return name
}

function notFound(): GatewayError {
  return new GatewayError("ACTION_NOT_FOUND", "This connector action does not exist.")
}
