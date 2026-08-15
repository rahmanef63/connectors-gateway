/**
 * Normalized gateway action id -> published CareerPack MCP tool name.
 *
 * CareerPack already ships a remote MCP server with a snake_case tool surface, so the
 * gateway maps onto it instead of renaming it (docs/06-connector-contract.md: "if an
 * existing external tool surface is already published, do not rename it casually").
 * This table is the ONLY place an upstream name is allowed to appear.
 */
import { GatewayError } from "@cg/core"
import { ACTION_APPLICATION_CREATE, ACTION_PROFILE_READ } from "./manifest"

// TODO(rr): confirm upstream tool names against the live CareerPack MCP tools/list
// (and the argument names in ./input) before this connector is enabled in production.
export const UPSTREAM_TOOL: Record<string, string> = Object.freeze({
  [ACTION_PROFILE_READ]: "get_profile",
  [ACTION_APPLICATION_CREATE]: "create_application",
})

/**
 * Never echoes the caller-supplied id back into the message.
 * Own-key check only: a bare index would resolve `toString` through the prototype chain.
 */
export function resolveTool(actionId: string): string {
  const tool = Object.hasOwn(UPSTREAM_TOOL, actionId) ? UPSTREAM_TOOL[actionId] : undefined
  if (typeof tool !== "string") {
    throw new GatewayError("ACTION_NOT_FOUND", "This CareerPack action does not exist.")
  }
  return tool
}
