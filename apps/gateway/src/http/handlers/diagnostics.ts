/** Operator-only, credential-safe runtime diagnostics. */
import { timingSafeEqual } from "node:crypto"
import { remoteMcpDiagnostics } from "../../../../../adapters/remote-mcp/src/index"
import { GatewayError } from "@cg/core"
import { jsonResponse } from "../respond"
import type { RouteContext } from "../routes"

export async function handleDiagnostics(context: RouteContext): Promise<Response> {
  assertOperator(context.request.headers.get("authorization"), context.deps.config.serviceToken)
  return jsonResponse({
    status: "ok",
    remoteMcp: remoteMcpDiagnostics(),
  })
}

function assertOperator(header: string | null, expected: string): void {
  const prefix = "Bearer "
  const presented = header?.startsWith(prefix) ? header.slice(prefix.length) : ""
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  const valid = a.length === b.length && timingSafeEqual(a, b)
  if (!valid) throw new GatewayError("NOT_AUTHENTICATED", "Operator authentication failed.")
}
