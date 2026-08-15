/**
 * The trusted built-in connector registry (packages/registry/README.md).
 *
 * Manifests are INJECTED, never imported: an adapter depends on the registry,
 * so the registry importing an adapter would be a cycle.
 */
import { GatewayError, findAction } from "@cg/core"
import type { ActionDefinition, ConnectorManifest } from "@cg/core"
import { validateManifest } from "@cg/schemas"

export type ResolvedAction = {
  connector: ConnectorManifest
  action: ActionDefinition
}

export interface ConnectorRegistry {
  get(connectorId: string): ConnectorManifest | undefined
  list(): ConnectorManifest[]
  /** Throws CONNECTOR_NOT_FOUND / ACTION_NOT_FOUND — never returns undefined. */
  resolve(connectorId: string, actionId: string): ResolvedAction
}

/**
 * Action ids are globally unique, not per-connector: they are already
 * hierarchical (`blender.scene.render`, docs/06) and the MCP tool namespace is
 * flat, so two connectors claiming one id would make routing ambiguous.
 */
function index(manifests: readonly ConnectorManifest[]): Map<string, ConnectorManifest> {
  const byId = new Map<string, ConnectorManifest>()
  const actionOwner = new Map<string, string>()

  for (const candidate of manifests) {
    // Boot-time gate: a built-in connector that fails its own contract must not load.
    const manifest = validateManifest(candidate)

    if (byId.has(manifest.id)) {
      throw new GatewayError("INVALID_INPUT", `Duplicate connector id: ${manifest.id}`)
    }
    byId.set(manifest.id, manifest)

    for (const action of manifest.actions) {
      const owner = actionOwner.get(action.id)
      if (owner !== undefined) {
        throw new GatewayError("INVALID_INPUT", `Duplicate action id: ${action.id}`)
      }
      actionOwner.set(action.id, manifest.id)
    }
  }

  return byId
}

export function createRegistry(manifests: ConnectorManifest[]): ConnectorRegistry {
  if (!Array.isArray(manifests)) {
    throw new GatewayError("INVALID_INPUT", "Registry expects an array of connector manifests.")
  }

  const byId = index(manifests)

  return {
    get(connectorId: string): ConnectorManifest | undefined {
      return byId.get(connectorId)
    },

    list(): ConnectorManifest[] {
      return [...byId.values()]
    },

    resolve(connectorId: string, actionId: string): ResolvedAction {
      // Caller-supplied ids are never echoed back: the message goes to an AI
      // client and the id is untrusted text. Duplicate-id errors above may echo,
      // because those values come from our own built-in manifests.
      const connector = byId.get(connectorId)
      if (!connector) {
        throw new GatewayError("CONNECTOR_NOT_FOUND", "Connector not found.")
      }

      const action = findAction(connector, actionId)
      if (!action) {
        throw new GatewayError("ACTION_NOT_FOUND", "Action not found.")
      }

      return { connector, action }
    },
  }
}
