/**
 * THE execution path. Every entry point (MCP, REST, future SDK) funnels here,
 * so there is exactly one place where authentication, validation, policy and
 * audit can be got wrong — and exactly one place to review.
 *
 * Order is fixed and load-bearing (docs/02 "Data plane"):
 *   1 authenticate  2 resolve  3 validate  4 strip identity
 *   5 policy        6 route+execute        7 audit (finally)  8 normalize
 */
import { GatewayError, toGatewayError } from "@cg/core"
import type {
  ActionDefinition,
  ConnectorManifest,
  ExecutionResult,
  PolicyDecision,
  Principal,
} from "@cg/core"
import { authenticateCaller } from "@cg/auth"
import { validateActionInput } from "@cg/schemas"
import { toRequestContext } from "../context"
import { appendAudit } from "./audit"
import { decide } from "./decide"
import { stripIdentityFields } from "./identity"
import type { ExecuteInput, PipelineDeps } from "./types"

export type { ExecuteInput, PipelineDeps } from "./types"

export async function executeAction(
  deps: PipelineDeps,
  request: ExecuteInput,
): Promise<ExecutionResult> {
  const startedAt = performance.now()
  let principal: Principal | undefined
  let connector: ConnectorManifest | undefined
  let action: ActionDefinition | undefined
  let decision: PolicyDecision = "DENY"
  let result: ExecutionResult | undefined

  try {
    // 1. Identity comes only from the presented credential.
    principal = request.principal ?? (await authenticate(deps, request.token))

    // 2. Resolve against the trusted built-in registry.
    const resolved = deps.registry.resolve(request.connectorId, request.actionId)
    connector = resolved.connector
    action = resolved.action

    // 3. The AI's arguments are untrusted until the schema says otherwise.
    const validated = validateActionInput(action.inputSchema, request.input)

    // 4. Identity-shaped arguments never reach an adapter (docs/05).
    const { input, stripped } = stripIdentityFields(validated)
    if (stripped.length > 0) {
      request.scope.logger.warn("dropped caller-supplied identity fields", { fields: stripped })
    }

    // 5. Policy runs per action, not per connection.
    decision = await decide(deps, principal, connector, action)
    assertAllowed(decision)

    // 6. Cloud vs local is decided from the manifest, never by the caller.
    result = await deps.executor.execute({
      context: toRequestContext(request.scope, principal),
      connector,
      action,
      input,
    })
    return result
  } catch (cause) {
    // 8. One normalized shape for every failure, with a code the caller can act on.
    const error = toGatewayError(cause)
    result = {
      status: "error",
      error: { code: error.code, message: error.message },
      timingMs: performance.now() - startedAt,
    }
    return result
  } finally {
    // 7. A throw anywhere above still lands here. A failing sink is logged and
    // swallowed: the side effect already happened, so replacing a completed
    // action's result with a 500 would report something untrue.
    try {
      await record(deps, {
        request,
        principal,
        connector,
        action,
        decision,
        result,
        latencyMs: performance.now() - startedAt,
      })
    } catch {
      deps.logger.error("audit write failed", { requestId: request.scope.requestId })
    }
  }
}

async function authenticate(deps: PipelineDeps, token: string | null): Promise<Principal> {
  if (token === null) throw new GatewayError("NOT_AUTHENTICATED", "Invalid credentials.")
  return authenticateCaller(token, deps.apiKeys)
}

/**
 * MVP: there is no auto-approval path. REQUIRE_APPROVAL is returned as a code
 * the dashboard can act on, and the audit row records the decision (docs/09).
 */
function assertAllowed(decision: PolicyDecision): void {
  if (decision === "DENY") {
    throw new GatewayError("POLICY_DENIED", "This action is not permitted by policy.")
  }
  if (decision === "REQUIRE_APPROVAL") {
    throw new GatewayError(
      "APPROVAL_REQUIRED",
      "This action needs approval in the dashboard before it can run.",
    )
  }
}

type RecordInput = {
  request: ExecuteInput
  principal: Principal | undefined
  connector: ConnectorManifest | undefined
  action: ActionDefinition | undefined
  decision: PolicyDecision
  result: ExecutionResult | undefined
  latencyMs: number
}

/**
 * No principal means authentication failed. That row is deliberately NOT
 * written: it would be an unauthenticated write into the control plane with
 * caller-controlled connector/action strings. It is logged instead.
 */
async function record(deps: PipelineDeps, input: RecordInput): Promise<void> {
  if (!input.principal) {
    deps.logger.warn("unauthenticated action request", {
      requestId: input.request.scope.requestId,
      errorCode: input.result?.error?.code ?? "NOT_AUTHENTICATED",
    })
    return
  }
  await appendAudit(deps.audit, {
    requestId: input.request.scope.requestId,
    principal: input.principal,
    connectorId: input.connector?.id ?? input.request.connectorId,
    actionId: input.action?.id ?? input.request.actionId,
    // An unresolved connector has no executor kind; `cloud` is the neutral
    // default and the row is an error row anyway.
    executorKind: input.connector?.executor ?? "cloud",
    policyDecision: input.decision,
    status: input.result?.status ?? "error",
    latencyMs: input.latencyMs,
    ...(input.result?.error ? { errorCode: input.result.error.code } : {}),
  })
}
