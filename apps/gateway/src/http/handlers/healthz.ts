/**
 * Liveness only. No auth, and deliberately no data: a health endpoint that
 * reports device counts or connector names is a free reconnaissance surface.
 */
import { jsonResponse } from "../respond"
import type { RouteContext } from "../routes"

export async function handleHealthz(_context: RouteContext): Promise<Response> {
  return jsonResponse({ status: "ok" })
}
