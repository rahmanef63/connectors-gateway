/**
 * The one seam through which the gateway talks to the control plane.
 *
 * Two jobs: inject the service token (so no call site can forget it), and turn
 * any transport/Convex failure into an opaque UPSTREAM_ERROR. A Convex error
 * message can quote argument values — including a device credential — so it is
 * logged as a boolean, never forwarded.
 */
import { GatewayError } from "@cg/core"
import type { Logger } from "@cg/observability"
import { ConvexHttpClient } from "convex/browser"
import type { FunctionReference } from "convex/server"

type AnyQuery = FunctionReference<"query", "public", never, unknown>
type AnyMutation = FunctionReference<"mutation", "public", never, unknown>

export interface ControlPlaneClient {
  query<A extends Record<string, unknown>>(
    ref: FunctionReference<"query", "public", A, unknown>,
    args: Omit<A, "serviceToken">,
  ): Promise<unknown>
  mutation<A extends Record<string, unknown>>(
    ref: FunctionReference<"mutation", "public", A, unknown>,
    args: Omit<A, "serviceToken">,
  ): Promise<unknown>
}

export type ConvexClientOptions = {
  url: string
  serviceToken: string
  logger: Logger
  /** Test seam. Defaults to a real ConvexHttpClient. */
  transport?: {
    query(ref: AnyQuery, args: Record<string, unknown>): Promise<unknown>
    mutation(ref: AnyMutation, args: Record<string, unknown>): Promise<unknown>
  }
}

function unavailable(): GatewayError {
  return new GatewayError("UPSTREAM_ERROR", "The control plane is unavailable.")
}

export function createControlPlaneClient(options: ConvexClientOptions): ControlPlaneClient {
  const transport =
    options.transport ??
    (new ConvexHttpClient(options.url, {
      skipConvexDeploymentUrlCheck: true,
      logger: false,
    }) as unknown as NonNullable<ConvexClientOptions["transport"]>)

  async function call(
    kind: "query" | "mutation",
    ref: unknown,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const withToken = { ...args, serviceToken: options.serviceToken }
    try {
      return kind === "query"
        ? await transport.query(ref as AnyQuery, withToken)
        : await transport.mutation(ref as AnyMutation, withToken)
    } catch {
      // The thrown value may echo `args`, which can contain a credential.
      options.logger.error("control plane call failed", { kind })
      throw unavailable()
    }
  }

  return {
    query: (ref, args) => call("query", ref, args as Record<string, unknown>),
    mutation: (ref, args) => call("mutation", ref, args as Record<string, unknown>),
  }
}
