/**
 * Thin authoring helpers. Deliberately not a framework — docs say keep the SDK
 * thin until two connectors prove the API (packages/sdk/README.md).
 */
import type { ActionDefinition, ConnectorManifest } from "@cg/core"

/** Identity function that pins the manifest type at the definition site. */
export function defineConnector(manifest: ConnectorManifest): ConnectorManifest {
  return manifest
}

export function defineAction(action: ActionDefinition): ActionDefinition {
  return action
}
