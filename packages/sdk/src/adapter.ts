/**
 * Adapter contracts. An adapter translates one normalized action into the
 * target application's real protocol — and owns nothing else (adapters/README.md).
 */
import type { CapabilityReport, ConnectionCredential, ConnectorManifest, ResultFile } from "@cg/core"

export type AdapterOutput = {
  output: unknown
  files?: ResultFile[]
}

export type CloudAdapterContext = {
  requestId: string
  /** Resolved server-side from the stored connection. Never AI-supplied. */
  credential: ConnectionCredential
  signal: AbortSignal
}

export interface CloudAdapter {
  manifest: ConnectorManifest
  execute(actionId: string, input: unknown, context: CloudAdapterContext): Promise<AdapterOutput>
}

export type LocalAdapterContext = {
  requestId: string
  signal: AbortSignal
}

export interface LocalAdapter {
  manifest: ConnectorManifest
  /** Probe the local application and report what is actually usable. */
  detect(): Promise<CapabilityReport>
  execute(actionId: string, input: unknown, context: LocalAdapterContext): Promise<AdapterOutput>
}

export function defineCloudAdapter(adapter: CloudAdapter): CloudAdapter {
  return adapter
}

export function defineLocalAdapter(adapter: LocalAdapter): LocalAdapter {
  return adapter
}
