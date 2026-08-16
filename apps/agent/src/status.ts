/**
 * `agent status`. Everything here is printed to a terminal, so the report is
 * built from an explicit field list — the credential is never copied into it,
 * and neither is any absolute path (AGENTS.md P0).
 */
import type { CapabilityReport } from "@cg/core"
import type { AgentConfig } from "./config"
import { qualifyCapability } from "./adapters"
import type { ConnectionState } from "./session"

export function formatStatus(
  config: AgentConfig | null,
  reports: readonly CapabilityReport[],
  connection: ConnectionState,
): string {
  // Field by field, never a spread: a spread of `config` would print the credential.
  const lines = [
    `device:      ${config?.deviceId ?? "not paired (run: agent pair)"}`,
    `gateway:     ${config?.gatewayUrl ?? "unset"}`,
    `connection:  ${describeConnection(connection)}`,
    "adapters:",
  ]
  if (reports.length === 0) lines.push("  (none registered)")
  for (const report of reports) {
    const version = report.version === undefined ? "" : ` ${report.version}`
    lines.push(`  ${report.connector}${version}: ${report.status}`)
    for (const capability of report.capabilities) {
      lines.push(`    - ${qualifyCapability(report.connector, capability)}`)
    }
  }
  const disabledActions = config?.disabledActions ?? []
  if (disabledActions.length > 0) {
    lines.push("disabled locally:")
    for (const actionId of disabledActions) lines.push(`  - ${actionId}`)
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
