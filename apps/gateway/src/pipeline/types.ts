/** Inputs and ports of the execution pipeline. */
import type { AuditSink, DeviceStore, Executor, PolicyStore, Principal } from "@cg/core"
import type { ApiKeyLookup } from "@cg/auth"
import type { Logger } from "@cg/observability"
import type { ConnectorRegistry } from "@cg/registry"
import type { RequestScope } from "../context"
import type { ApprovalStore } from "../store/approvals"

export type PipelineDeps = {
  registry: ConnectorRegistry
  apiKeys: ApiKeyLookup
  policy: PolicyStore
  devices: DeviceStore
  audit: AuditSink
  /** The router from @cg/executor: cloud vs local is decided from the manifest. */
  executor: Executor
  /**
   * Persistence for REQUIRE_APPROVAL. Optional so a deployment without a
   * control plane still runs — but note what its absence MEANS: every R2+
   * action is refused outright rather than queued, which is the pre-2026-08-16
   * behaviour, not a relaxed one.
   */
  approvals?: ApprovalStore
  logger: Logger
}

export type ExecuteInput = {
  scope: RequestScope
  /** Raw bearer token. Never a body field. */
  token: string | null
  /**
   * Principal this request's edge handler already authenticated from the SAME
   * bearer token (the MCP endpoint needs one before it can build a catalog).
   * Supplying it skips a second PBKDF2 round; it is never derived from a body
   * field, and its absence makes the token the only way in.
   */
  principal?: Principal
  connectorId: string
  actionId: string
  input: unknown
}
