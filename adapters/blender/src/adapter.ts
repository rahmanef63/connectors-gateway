/**
 * Blender local adapter: normalized action in, loopback bridge call out.
 *
 * Runs inside the local agent on the user's machine. It owns no auth, no policy and no
 * audit (adapters/README.md) — it owns exactly two safety duties: never talk to anything
 * but loopback, and never hand a local filesystem path back toward the model.
 */
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CapabilityReport } from "@cg/core"
import { GatewayError, findAction } from "@cg/core"
import type { AdapterOutput, LocalAdapter, LocalAdapterContext } from "@cg/sdk"
import { defineLocalAdapter } from "@cg/sdk"
import { ACTION_FILE_EXPORT, BLENDER_CONNECTOR_ID } from "./action-ids"
import { BridgeClient, DEFAULT_BRIDGE_TIMEOUT_MS } from "./bridge-client"
import { HEALTH_ENDPOINT, endpointFor } from "./endpoints"
import { asPayload, exportBody } from "./input"
import { BLENDER_ADAPTER_VERSION, BLENDER_CAPABILITIES, manifest } from "./manifest"
import { normalizeOutput } from "./normalize"

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8787"
/** The only directory this adapter will ever name for an export. */
export const DEFAULT_EXPORT_ROOT = join(tmpdir(), "connectors-gateway", "blender-exports")

const MAX_VERSION_LENGTH = 32
const VERSION_PATTERN = /^[A-Za-z0-9 ._()-]{1,32}$/

export type BlenderAdapterOptions = {
  /** Must be loopback. Anything else is rejected at construction time. */
  bridgeUrl?: string
  exportRoot?: string
  timeoutMs?: number
}

export function createBlenderAdapter(options: BlenderAdapterOptions = {}): LocalAdapter {
  const client = new BridgeClient(
    options.bridgeUrl ?? DEFAULT_BRIDGE_URL,
    options.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS,
  )
  const exportRoot = options.exportRoot ?? DEFAULT_EXPORT_ROOT

  return defineLocalAdapter({
    manifest,

    async detect(): Promise<CapabilityReport> {
      try {
        const health = await client.get(HEALTH_ENDPOINT)
        const version = readVersion(health["version"])
        const report: CapabilityReport = {
          connector: BLENDER_CONNECTOR_ID,
          status: "available",
          adapterVersion: BLENDER_ADAPTER_VERSION,
          capabilities: announcedCapabilities(health["capabilities"]),
        }
        if (version !== undefined) report.version = version
        return report
      } catch {
        // Never throws: one unreachable local app must not stop the agent from coming
        // online and reporting the adapters that do work (docs/05 connection lifecycle).
        return {
          connector: BLENDER_CONNECTOR_ID,
          status: "unavailable",
          adapterVersion: BLENDER_ADAPTER_VERSION,
          capabilities: [],
        }
      }
    },

    async execute(actionId: string, input: unknown, context: LocalAdapterContext): Promise<AdapterOutput> {
      if (findAction(manifest, actionId) === undefined) {
        throw new GatewayError("ACTION_NOT_FOUND", "This Blender action does not exist.")
      }
      const endpoint = endpointFor(actionId)
      const payload = asPayload(input)
      const body = actionId === ACTION_FILE_EXPORT ? exportBody(payload, exportRoot) : payload

      const raw = await client.post(endpoint, body, context.signal)
      return { output: normalizeOutput(actionId, raw) }
    },
  })
}

/** A bridge may only confirm capabilities this adapter already declares — never add new ones. */
function announcedCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const announced = new Set(value.filter((entry): entry is string => typeof entry === "string"))
  return BLENDER_CAPABILITIES.filter((capability) => announced.has(capability))
}

function readVersion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim().slice(0, MAX_VERSION_LENGTH)
  return VERSION_PATTERN.test(trimmed) ? trimmed : undefined
}

/** Ready-to-register adapter using the default loopback bridge URL. */
export const blenderAdapter: LocalAdapter = createBlenderAdapter()
