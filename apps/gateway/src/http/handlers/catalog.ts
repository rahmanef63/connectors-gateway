/**
 * GET /v1/catalog — the caller's resolved tool catalog (docs/07).
 * Authentication is the first thing that happens; the catalog is derived from
 * the authenticated principal, never from a query parameter.
 */
import { GatewayError } from "@cg/core"
import { authenticateCaller, parseAuthorizationHeader } from "@cg/auth"
import { resolveCatalog } from "../../catalog"
import { errorResponseFor, jsonResponse } from "../respond"
import type { RouteContext } from "../routes"

export async function handleCatalog(context: RouteContext): Promise<Response> {
  try {
    const token = parseAuthorizationHeader(context.request.headers.get("authorization"))
    if (token === null) throw new GatewayError("NOT_AUTHENTICATED", "Invalid credentials.")
    const principal = await authenticateCaller(token, context.deps.apiKeys)

    const entries = await resolveCatalog(context.deps, principal)
    return jsonResponse({
      connectors: entries.map((entry) => ({
        id: entry.connector.id,
        name: entry.connector.name,
        version: entry.connector.version,
        executor: entry.connector.executor,
        actions: entry.actions.map((action) => ({
          id: action.id,
          title: action.title,
          description: action.description,
          inputSchema: action.inputSchema,
          outputSchema: action.outputSchema ?? null,
          risk: action.risk,
          annotations: action.annotations,
        })),
      })),
    })
  } catch (cause) {
    return errorResponseFor(cause)
  }
}
