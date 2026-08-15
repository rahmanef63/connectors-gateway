/**
 * The built-in connector registry.
 *
 * The Blender MANIFEST only. The gateway must never execute a local adapter:
 * `blenderAdapter` runs inside apps/agent, on the user's machine, behind a
 * loopback bridge (AGENTS.md invariant 1/3). Importing the manifest gives the
 * catalog and the policy engine what they need and nothing more.
 */
import type { ConnectorManifest } from "@cg/core"
import { manifest as blenderManifest } from "@cg/adapter-blender"
import { manifest as careerpackManifest } from "@cg/adapter-careerpack"
import { createRegistry } from "@cg/registry"
import type { ConnectorRegistry } from "@cg/registry"

export const BUILT_IN_MANIFESTS: readonly ConnectorManifest[] = Object.freeze([
  careerpackManifest,
  blenderManifest,
])

/** Boot-time gate: a manifest that fails its own contract stops the process. */
export function createBuiltInRegistry(): ConnectorRegistry {
  return createRegistry([...BUILT_IN_MANIFESTS])
}
