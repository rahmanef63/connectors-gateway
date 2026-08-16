/**
 * The connector contract — docs/06-connector-contract.md.
 * Cloud and local connectors are described identically; only `executor` differs.
 */
import type { AuthType, ExecutorKind, RiskClass } from "./risk"

/** A JSON Schema document. Kept opaque: validation lives in @cg/schemas. */
export type JsonSchema = Record<string, unknown>

export type ActionAnnotations = {
  readOnly: boolean
  destructive: boolean
  idempotent?: boolean
}

export type ActionDefinition = {
  /** Stable hierarchical id, e.g. `blender.scene.render`. */
  id: string
  title: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  risk: RiskClass
  annotations: ActionAnnotations
  requiredScopes?: string[]
  /** Device capabilities that must be announced before this action can run. */
  requiredCapabilities?: string[]
}

export type ConnectorAuth = {
  type: AuthType
  /**
   * Which header carries the credential, when the upstream does not use the
   * `Authorization: Bearer` default.
   *
   * Most remote MCP servers take a bearer, so this is absent almost always.
   * It exists because some do not — Composio wants `x-api-key` — and without
   * it "a connector to any remote MCP server is data, not code" (docs/16) is
   * only true for the servers that happen to agree with us about a header
   * name. One optional field keeps that claim honest; the alternative is a
   * bespoke adapter per auth style, which is the thing this design avoids.
   */
  header?: string
  /** Prefix before the credential value. Defaults to `Bearer ` for the
   *  Authorization header and to nothing for any other header. */
  scheme?: string
  [key: string]: unknown
}

export type ConnectorManifest = {
  id: string
  name: string
  version: string
  executor: ExecutorKind
  /**
   * Where a cloud connector's remote MCP server lives, when the manifest knows.
   *
   * Optional because a `local` connector has no such address, and because a
   * self-hosted upstream can only be named by whoever runs it. When it IS here,
   * nothing has to ask a human for a base URL — the connect flow reads it, and
   * the same value is what OAuth discovery treats as the protected resource.
   */
  endpoint?: string
  auth: ConnectorAuth
  actions: ActionDefinition[]
}

export function findAction(
  manifest: ConnectorManifest,
  actionId: string,
): ActionDefinition | undefined {
  return manifest.actions.find((action) => action.id === actionId)
}
