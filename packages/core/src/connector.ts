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
  [key: string]: unknown
}

export type ConnectorManifest = {
  id: string
  name: string
  version: string
  executor: ExecutorKind
  auth: ConnectorAuth
  actions: ActionDefinition[]
}

export function findAction(
  manifest: ConnectorManifest,
  actionId: string,
): ActionDefinition | undefined {
  return manifest.actions.find((action) => action.id === actionId)
}
