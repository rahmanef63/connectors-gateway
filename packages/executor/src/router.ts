/**
 * Executor routing (docs/02 "Router decision"). The cloud/local split is an
 * implementation detail of the gateway — the AI never branches on it, so the
 * router is itself an Executor and the choice is made from the manifest.
 */
import { GatewayError } from "@cg/core"
import type { ConnectorManifest, ExecutionRequest, ExecutionResult, Executor } from "@cg/core"

export type RouterDeps = {
  cloud: Executor
  local: Executor
}

export type Router = Executor & {
  route(connector: ConnectorManifest): Executor
}

export function createRouter(deps: RouterDeps): Router {
  function route(connector: ConnectorManifest): Executor {
    // `executor` comes from a manifest, so it is validated rather than trusted.
    if (connector.executor === "cloud") return deps.cloud
    if (connector.executor === "local") return deps.local
    throw new GatewayError(
      "CONNECTOR_NOT_FOUND",
      `Connector "${connector.id}" declares an unsupported executor.`,
    )
  }

  return {
    route,
    execute(request: ExecutionRequest): Promise<ExecutionResult> {
      return route(request.connector).execute(request)
    },
  }
}
