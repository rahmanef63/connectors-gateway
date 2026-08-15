/**
 * POST /v1/actions/:connector/:action — REST execution.
 * A thin skin: the connector/action come from the PATH, the arguments from the
 * body, and everything else is the pipeline's job.
 */
import { parseAuthorizationHeader } from "@cg/auth"
import { executeAction } from "../../pipeline/execute"
import { readJsonBody } from "../body"
import { errorResponseFor, executionResponse } from "../respond"
import type { RouteContext } from "../routes"

/** `input` may be nested under `input`, or be the body itself. */
function inputFrom(body: Record<string, unknown>): unknown {
  const nested = body.input
  return typeof nested === "object" && nested !== null && !Array.isArray(nested) ? nested : body
}

export async function handleActionRoute(context: RouteContext): Promise<Response> {
  try {
    const body = await readJsonBody(context.request)
    const result = await executeAction(context.deps, {
      scope: context.scope,
      token: parseAuthorizationHeader(context.request.headers.get("authorization")),
      connectorId: context.params.connector ?? "",
      actionId: context.params.action ?? "",
      input: inputFrom(body),
    })
    return executionResponse(result)
  } catch (cause) {
    // Only body/transport failures land here; the pipeline never throws.
    return errorResponseFor(cause)
  }
}
