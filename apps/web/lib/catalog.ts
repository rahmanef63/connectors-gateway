/**
 * The connector catalog, read from the manifests this build ships.
 *
 * Same source the gateway boots from — `adapters/remote-mcp/connectors/*.json` plus the
 * Blender manifest — so the cards can never list a connector the gateway does not have,
 * and no sync job exists to fall behind. When connectors become database rows (docs/16
 * step 3) this function reads Convex instead and nothing above it changes.
 *
 * Server-only: it pulls in manifest validation (ajv), which has no business in a browser
 * bundle, and the card data below is a deliberate subset — `x-upstream` and any other
 * internal field must never reach the client.
 */
import type { ConnectorManifest } from "@cg/core"
import { manifest as blenderManifest } from "@cg/adapter-blender"
import { REMOTE_MCP_MANIFESTS } from "@cg/adapter-remote-mcp"

export type CatalogEntry = {
  id: string
  name: string
  version: string
  executor: "cloud" | "local"
  authType: string
  actionCount: number
  /** Highest risk class any of its actions carries — what the card warns about. */
  topRisk: "R0" | "R1" | "R2" | "R3" | "R4"
  /** A few action ids, for the card's "what it can do" line. */
  sampleActions: string[]
}

const RISK_ORDER = ["R0", "R1", "R2", "R3", "R4"] as const

function toEntry(manifest: ConnectorManifest): CatalogEntry {
  const risks = manifest.actions.map((action) => RISK_ORDER.indexOf(action.risk))
  const topRisk = RISK_ORDER[Math.max(0, ...risks)] ?? "R0"

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    executor: manifest.executor,
    authType: manifest.auth.type,
    actionCount: manifest.actions.length,
    topRisk,
    sampleActions: manifest.actions.slice(0, 3).map((action) => action.id),
  }
}

/** Every connector this build can run, cloud and local, sorted for a stable grid. */
export function catalogEntries(): CatalogEntry[] {
  return [...REMOTE_MCP_MANIFESTS, blenderManifest]
    .map(toEntry)
    .sort((a, b) => a.name.localeCompare(b.name))
}
