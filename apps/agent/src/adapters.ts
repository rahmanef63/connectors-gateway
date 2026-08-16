/**
 * Local adapter registry: what this machine can actually do.
 *
 * `detect()` is the only source of truth for availability — a manifest declares
 * what an adapter could do, a capability report says what it can do right now.
 */
import type { ActionDefinition, CapabilityReport } from "@cg/core"
import { findAction } from "@cg/core"
import type { LocalAdapter } from "@cg/sdk"
import { createBlenderAdapter } from "@cg/adapter-blender"
import type { EnvSource } from "./env"
import { readAgentEnv } from "./env"

/**
 * Manifests declare connector-relative capabilities (`scene.render`); the agent
 * qualifies them as `blender:scene.render` for its own allowlist and for status.
 * The wire `CapabilityReport` stays relative — packages/schemas forbids `:` there
 * so one adapter can never claim another connector's namespace.
 */
export function qualifyCapability(connectorId: string, capability: string): string {
  return capability.includes(":") ? capability : `${connectorId}:${capability}`
}

export type AvailableIndex = {
  /** Namespaced capabilities from adapters currently reporting "available". */
  capabilities: ReadonlySet<string>
  connectors: ReadonlySet<string>
}

export type AdapterRegistry = {
  get(connectorId: string): LocalAdapter | undefined
  findAction(connectorId: string, actionId: string): ActionDefinition | undefined
  /** Re-probes every adapter. Runs at startup and on every reconnect. */
  detectAll(): Promise<readonly CapabilityReport[]>
  available(): AvailableIndex
}

export function createAdapterRegistry(adapters: readonly LocalAdapter[]): AdapterRegistry {
  const byConnector = new Map<string, LocalAdapter>()
  for (const adapter of adapters) byConnector.set(adapter.manifest.id, adapter)
  let latest: readonly CapabilityReport[] = []

  return {
    get: (connectorId) => byConnector.get(connectorId),

    findAction(connectorId, actionId) {
      const adapter = byConnector.get(connectorId)
      return adapter === undefined ? undefined : findAction(adapter.manifest, actionId)
    },

    async detectAll() {
      const settled = await Promise.allSettled(adapters.map((adapter) => adapter.detect()))
      latest = settled.map((result, index) =>
        result.status === "fulfilled" ? result.value : unavailable(adapters[index]),
      )
      return latest
    },

    available(): AvailableIndex {
      const capabilities = new Set<string>()
      const connectors = new Set<string>()
      for (const report of latest) {
        if (report.status !== "available") continue
        connectors.add(report.connector)
        for (const capability of report.capabilities) {
          capabilities.add(qualifyCapability(report.connector, capability))
        }
      }
      return { capabilities, connectors }
    },
  }
}

/**
 * The MVP registry: one local connector (AGENTS.md "MVP boundary").
 * A non-loopback BLENDER_BRIDGE_URL makes this throw at startup — invariant 3.
 */
export function createDefaultRegistry(source: EnvSource = process.env): AdapterRegistry {
  const env = readAgentEnv(source)
  const blender =
    env.blenderBridgeUrl === undefined
      ? createBlenderAdapter()
      : createBlenderAdapter({ bridgeUrl: env.blenderBridgeUrl })
  return createAdapterRegistry([blender])
}

/** A detect() that threw is indistinguishable from an app that is not running. */
function unavailable(adapter: LocalAdapter | undefined): CapabilityReport {
  return {
    connector: adapter?.manifest.id ?? "unknown",
    status: "unavailable",
    adapterVersion: adapter?.manifest.version ?? "0.0.0",
    capabilities: [],
  }
}
