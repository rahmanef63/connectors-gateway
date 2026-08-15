/**
 * `agent status`. Everything here is printed to a terminal, so the report is
 * built from an explicit field list — the credential is never copied into it,
 * and neither is any absolute path (AGENTS.md P0).
 */
import type { CapabilityReport } from "@cg/core"
import type { AgentConfig } from "./config"
import { qualifyCapability } from "./adapters"
import type { ConnectionState } from "./session"

export type AdapterStatus = {
  connector: string
  status: CapabilityReport["status"]
  version?: string
  /** Namespaced, exactly as the local allowlist sees them. */
  capabilities: string[]
}

export type StatusReport = {
  paired: boolean
  deviceId?: string
  gatewayUrl?: string
  connection: ConnectionState
  adapters: AdapterStatus[]
  disabledActions: string[]
}

export type StatusInput = {
  config: AgentConfig | null
  reports: readonly CapabilityReport[]
  connection: ConnectionState
}

export function buildStatus(input: StatusInput): StatusReport {
  const report: StatusReport = {
    paired: input.config !== null,
    connection: input.connection,
    adapters: input.reports.map(toAdapterStatus),
    disabledActions: input.config?.disabledActions ?? [],
  }
  // Field-by-field, never a spread: a spread of `config` would print the credential.
  if (input.config !== null) {
    report.deviceId = input.config.deviceId
    report.gatewayUrl = input.config.gatewayUrl
  }
  return report
}

export function formatStatus(report: StatusReport): string {
  const lines = [
    `device:      ${report.deviceId ?? "not paired (run: agent pair)"}`,
    `gateway:     ${report.gatewayUrl ?? "unset"}`,
    `connection:  ${describeConnection(report.connection)}`,
    "adapters:",
  ]
  if (report.adapters.length === 0) lines.push("  (none registered)")
  for (const adapter of report.adapters) {
    const version = adapter.version === undefined ? "" : ` ${adapter.version}`
    lines.push(`  ${adapter.connector}${version}: ${adapter.status}`)
    for (const capability of adapter.capabilities) lines.push(`    - ${capability}`)
  }
  if (report.disabledActions.length > 0) {
    lines.push("disabled locally:")
    for (const actionId of report.disabledActions) lines.push(`  - ${actionId}`)
  }
  return lines.join("\n")
}

/**
 * ponytail: the CLI cannot see a session running in another process, so it
 * reports what IT observes. A state file or a local status socket is the upgrade.
 */
function describeConnection(state: ConnectionState): string {
  if (state === "idle") return "not connected in this process (run: agent run)"
  return state
}

function toAdapterStatus(report: CapabilityReport): AdapterStatus {
  const status: AdapterStatus = {
    connector: report.connector,
    status: report.status,
    capabilities: report.capabilities.map((capability) => qualifyCapability(report.connector, capability)),
  }
  if (report.version !== undefined) status.version = report.version
  return status
}
