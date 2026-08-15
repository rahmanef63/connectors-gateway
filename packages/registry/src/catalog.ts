/**
 * Dynamic tool catalog — the docs/07-mcp-gateway.md intersection:
 *
 *   installed connectors ∩ connected credentials ∩ device capabilities ∩ caller scopes
 *
 * Workspace policy is the fifth term and is deliberately NOT applied here: it is
 * evaluated per call by @cg/policy, because a REQUIRE_APPROVAL action still
 * belongs in the catalog. Hiding a tool is discovery, not authorization — the
 * gateway must re-check both on every execution.
 */
import { GatewayError } from "@cg/core"
import type { ActionDefinition, ConnectorManifest } from "@cg/core"
import type { ConnectorRegistry } from "./registry"

export type CatalogInput = {
  installedConnectorIds: string[]
  connectedConnectorIds: string[]
  /** Namespaced as `<connectorId>:<capability>`, e.g. `blender:scene.render`. */
  deviceCapabilities: string[]
  scopes: string[]
}

export type CatalogEntry = {
  connector: ConnectorManifest
  actions: ActionDefinition[]
}

/**
 * A manifest declares capabilities connector-relative (`scene.render`) while a
 * device announces them namespaced, so one connector can never satisfy another's
 * requirement. An already-namespaced value is passed through unchanged.
 */
export function capabilityKey(connectorId: string, capability: string): string {
  return capability.includes(":") ? capability : `${connectorId}:${capability}`
}

function toStringSet(values: unknown, label: string): Set<string> {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
    throw new GatewayError("INVALID_INPUT", `Catalog input: ${label} must be an array of strings.`)
  }
  return new Set(values as string[])
}

function isVisible(
  connectorId: string,
  action: ActionDefinition,
  scopes: Set<string>,
  capabilities: Set<string>,
): boolean {
  const requiredScopes = action.requiredScopes ?? []
  if (!requiredScopes.every((scope) => scopes.has(scope))) return false

  const requiredCapabilities = action.requiredCapabilities ?? []
  return requiredCapabilities.every((capability) =>
    capabilities.has(capabilityKey(connectorId, capability)),
  )
}

/** Connectors and actions this caller may currently see. Empty connectors are omitted. */
export function catalogFor(registry: ConnectorRegistry, input: CatalogInput): CatalogEntry[] {
  const installed = toStringSet(input?.installedConnectorIds, "installedConnectorIds")
  const connected = toStringSet(input?.connectedConnectorIds, "connectedConnectorIds")
  const capabilities = toStringSet(input?.deviceCapabilities, "deviceCapabilities")
  const scopes = toStringSet(input?.scopes, "scopes")

  const entries: CatalogEntry[] = []

  for (const connector of registry.list()) {
    if (!installed.has(connector.id)) continue
    if (!connected.has(connector.id)) continue

    const actions = connector.actions.filter((action) =>
      isVisible(connector.id, action, scopes, capabilities),
    )
    if (actions.length > 0) entries.push({ connector, actions })
  }

  return entries
}
