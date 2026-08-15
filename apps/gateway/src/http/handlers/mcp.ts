/**
 * POST /mcp — MCP JSON-RPC over HTTP. Bearer auth required.
 * The adapter itself lives in ../../mcp/server; this file is transport only.
 */
import { parseAuthorizationHeader } from "@cg/auth"
import { handleMcpRequest } from "../../mcp/server"
import { readJsonBody } from "../body"
import { errorResponseFor, jsonResponse } from "../respond"
import type { RouteContext } from "../routes"

export async function handleMcp(context: RouteContext): Promise<Response> {
  try {
    const body = await readJsonBody(context.request)
    const outcome = await handleMcpRequest(context.deps, {
      scope: context.scope,
      token: parseAuthorizationHeader(context.request.headers.get("authorization")),
      body,
    })
    if (!outcome.body) return new Response(null, { status: outcome.status })

    const headers: Record<string, string> = {}
    if (outcome.status === 401) headers["www-authenticate"] = "Bearer"
    return jsonResponse(outcome.body, outcome.status, headers)
  } catch (cause) {
    return errorResponseFor(cause)
  }
}
