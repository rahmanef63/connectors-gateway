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
import { stripCredentials, stripCredentialsDeep } from "@cg/observability"
import { validateActionInput } from "@cg/schemas"
import { toRequestContext } from "../context"
import { appendAudit } from "./audit"
import { decide } from "./decide"
import { stripIdentityFields } from "./identity"
import { approvalHash, inputPreview } from "./approval-key"
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
  let deviceId: string | undefined
  let connectionId: string | undefined

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
    await assertAllowed(deps, decision, principal, connector, action, validated)

    // 6. Cloud vs local is decided from the manifest, never by the caller.
    const executed = await deps.executor.execute({
      context: toRequestContext(request.scope, principal),
      connector,
      action,
      input,
    })
    deviceId = executed.deviceId
    connectionId = executed.connectionId

    // 6b. An upstream can echo back the header it was called with — a 401 body
    // quoting `Authorization`, an error naming the URL it was given. That would
    // hand the caller's own live gateway credential straight to the model, and
    // from there to the client's provider and its logs.
    //
    // Stripped HERE rather than in the MCP adapter because both surfaces read
    // this result: the REST route returns the same `output`, and a fix in one
    // adapter leaves the other one leaking.
    //
    // Only this gateway's credential grammar is removed — not keys named
    // `token`, not paths. A connector that was asked to read a config file must
    // still be able to return its contents; see `stripCredentials`.
    result = withoutCredentials(executed)
    return result
  } catch (cause) {
    // 8. One normalized shape for every failure, with a code the caller can act on.
    const error = toGatewayError(cause)
    result = {
      status: "error",
      // Same reason as the success path: an upstream failure message is the
      // MOST likely place for a credential to be quoted back at us.
      error: { code: error.code, message: stripCredentials(error.message) },
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
        deviceId,
        connectionId,
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
 * DENY is final. REQUIRE_APPROVAL now consults persistence instead of always
 * refusing: if the user has already approved THIS call — same connector, same
 * action, same arguments — the approval is spent here and execution continues.
 * Otherwise the call is queued for a human and still refused.
 *
 * The claim is a write, deliberately: asking "is it approved?" and marking it
 * used cannot be two steps, or two concurrent calls ride one decision.
 *
 * With no approval store configured this is exactly the old behaviour — refuse
 * — because a missing control plane must not read as blanket permission.
 */
async function assertAllowed(
  deps: PipelineDeps,
  decision: PolicyDecision,
  principal: Principal,
  connector: ConnectorManifest,
  action: ActionDefinition,
  input: unknown,
): Promise<void> {
  if (decision === "DENY") {
    throw new GatewayError("POLICY_DENIED", "This action is not permitted by policy.")
  }
  if (decision !== "REQUIRE_APPROVAL") return

  const store = deps.approvals
  const owner = principal.userId
  if (store === undefined || owner === undefined) {
    throw new GatewayError(
      "APPROVAL_REQUIRED",
      "This action needs approval in the dashboard before it can run.",
    )
  }

  const requestHash = approvalHash(connector.id, action.id, input)
  if (await store.claim(owner, requestHash)) return

  // Queue it, then refuse. A failure to record must not become permission, so
  // the throw happens either way — the user simply sees nothing to approve and
  // retries, which is the safe direction to fail in.
  try {
    await store.request({
      ownerId: owner,
      connectorId: connector.id,
      actionId: action.id,
      requestHash,
      inputPreview: inputPreview(input),
      risk: action.risk,
    })
  } catch (error) {
    deps.logger.warn?.("approval.request_failed", { connectorId: connector.id })
    void error
  }
  throw new GatewayError(
    "APPROVAL_REQUIRED",
    "This action needs approval in the dashboard before it can run.",
  )
}

type RecordInput = {
  request: ExecuteInput
  principal: Principal | undefined
  connector: ConnectorManifest | undefined
  action: ActionDefinition | undefined
  decision: PolicyDecision
  result: ExecutionResult | undefined
  deviceId: string | undefined
  connectionId: string | undefined
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
    ...(input.deviceId === undefined ? {} : { deviceId: input.deviceId }),
    ...(input.connectionId === undefined ? {} : { connectionId: input.connectionId }),
  })
}

/**
 * Remove this gateway's own credentials from a result before anyone reads it.
 *
 * `files` is left alone: it carries references and metadata, not upstream text,
 * and rewriting a filename would break the reference it exists to be.
 */
function withoutCredentials(result: ExecutionResult): ExecutionResult {
  // Explicit allowlist, not `{ ...result }`: executors also return audit-only
  // deviceId/connectionId. A spread would silently expose those identifiers to
  // REST and MCP as soon as attribution is added.
  const cleaned: ExecutionResult = { status: result.status, timingMs: result.timingMs }
  if (result.output !== undefined) cleaned.output = stripCredentialsDeep(result.output)
  if (result.files !== undefined) cleaned.files = result.files
  if (result.error) {
    cleaned.error = { code: result.error.code, message: stripCredentials(result.error.message) }
  }
  return cleaned
}
