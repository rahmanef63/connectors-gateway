/**
 * The caller's resolved tool catalog — the docs/07 intersection:
 *
 *   installed ∩ connected credentials ∩ device capabilities ∩ caller scopes
 *
 * Workspace policy is the fifth term and is deliberately NOT applied: a
 * REQUIRE_APPROVAL action still belongs in the catalog, and @cg/policy re-checks
 * every call. Hiding a tool is discovery, not authorization.
 */
import type { ConnectionStore, DeviceStore, Principal } from "@cg/core"
import { catalogFor } from "@cg/registry"
import type { CatalogEntry, ConnectorRegistry } from "@cg/registry"
import { announcedCapabilities, connectorsWithCapabilities } from "./capabilities"

export type CatalogDeps = {
  registry: ConnectorRegistry
  connections: ConnectionStore
  devices: DeviceStore
}

export async function resolveCatalog(
  deps: CatalogDeps,
  principal: Principal,
): Promise<CatalogEntry[]> {
  const [connections, devices] = await Promise.all([
    deps.connections.listForUser(principal.userId),
    deps.devices.listForUser(principal.userId),
  ])

  const deviceCapabilities = announcedCapabilities(devices)
  // A local connector has no Connection row: the paired device IS the
  // connection, so an online device announcing `blender:*` counts as connected.
  const connected = new Set(connectorsWithCapabilities(deviceCapabilities))
  for (const connection of connections) {
    if (connection.status === "active") connected.add(connection.connectorId)
  }

  return catalogFor(deps.registry, {
    // ponytail: every built-in connector counts as installed in the MVP. When
    // per-user installation lands, this becomes a control-plane query.
    installedConnectorIds: deps.registry.list().map((connector) => connector.id),
    connectedConnectorIds: [...connected],
    deviceCapabilities,
    scopes: principal.scopes,
  })
}
