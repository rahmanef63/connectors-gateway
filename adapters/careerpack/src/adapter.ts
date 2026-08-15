/**
 * CareerPack cloud adapter: normalized action in, upstream MCP tool call out.
 * Owns no auth, no policy, no audit (adapters/README.md) — the credential is resolved
 * server-side and handed in by the executor.
 */
import { GatewayError, findAction } from "@cg/core"
import type { AdapterOutput, CloudAdapter, CloudAdapterContext } from "@cg/sdk"
import { defineCloudAdapter } from "@cg/sdk"
import { manifest } from "./manifest"
import { callTool } from "./mcp-client"
import { resolveTool } from "./upstream"

export const careerpackAdapter: CloudAdapter = defineCloudAdapter({
  manifest,

  async execute(actionId: string, input: unknown, context: CloudAdapterContext): Promise<AdapterOutput> {
    if (findAction(manifest, actionId) === undefined) {
      throw new GatewayError("ACTION_NOT_FOUND", "This CareerPack action does not exist.")
    }

    const tool = resolveTool(actionId)
    const args = toolArguments(input)
    const { baseUrl, token } = context.credential
    if (typeof baseUrl !== "string" || typeof token !== "string" || token.length === 0) {
      throw new GatewayError("CONNECTION_MISSING", "The CareerPack connection is not configured.")
    }

    const output = await callTool(baseUrl, token, tool, args, context.signal)
    // Invariant 5 (AGENTS.md): a connector credential must never reach tool output,
    // not even when the upstream server echoes the Authorization header back at us.
    if (JSON.stringify(output ?? null).includes(token)) {
      throw new GatewayError("UPSTREAM_ERROR", "CareerPack echoed a credential; the response was discarded.")
    }
    return { output }
  },
})

/**
 * The pipeline has already validated `input` against `action.inputSchema`
 * (apps/gateway/src/pipeline/execute.ts step 3), so this is a shape narrowing for the
 * JSON-RPC `arguments` member, not a second validator. A second one would be worse than
 * none: two hand-maintained copies of one schema disagree, and the copy that rejects
 * first wins silently.
 */
function toolArguments(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {}
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new GatewayError("INVALID_INPUT", "Input must be an object.")
  }
  return input as Record<string, unknown>
}
