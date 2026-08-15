/**
 * Blender connector manifest — the normalized, transport-free action surface
 * (docs/06-connector-contract.md, docs/11-blender-reference.md "Safe MVP action surface").
 *
 * blender.python.execute, blender.shell.execute and blender.filesystem.raw are ABSENT
 * rather than present-and-disabled: an action that does not exist cannot be re-enabled by a
 * policy edit, a config typo, or prompt injection (AGENTS.md invariant 7).
 */
import type { ConnectorManifest } from "@cg/core"
import { defineConnector } from "@cg/sdk"
import { BLENDER_CONNECTOR_ID } from "./action-ids"
import { READ_ACTIONS } from "./actions-read"
import { WRITE_ACTIONS } from "./actions-write"

export const BLENDER_ADAPTER_VERSION = "0.1.0"

export const manifest: ConnectorManifest = defineConnector({
  id: BLENDER_CONNECTOR_ID,
  name: "Blender",
  version: BLENDER_ADAPTER_VERSION,
  executor: "local",
  // The device credential authenticates the agent; Blender itself has no account.
  auth: { type: "device" },
  actions: [...READ_ACTIONS, ...WRITE_ACTIONS],
})

/** Capability ids this adapter can ever use — the allowlist a bridge report is filtered against. */
export const BLENDER_CAPABILITIES: readonly string[] = Object.freeze(
  manifest.actions.flatMap((action) => action.requiredCapabilities ?? []),
)
