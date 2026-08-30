/**
 * Which of the SHIPPED connectors a given deployment actually serves.
 *
 * Lives in @cg/core, not @cg/registry, although the registry is where it is
 * conceptually at home: apps/gateway/src/config.ts reads the variable, and
 * config.ts must stay importable without dragging in the JSON-Schema validator
 * (and therefore ajv) that @cg/registry pulls behind it.
 *
 * The repository ships a set of example manifests, and a clone is meant to
 * replace them (docs/21-add-a-connector.md). Between "cloned it" and "wrote my
 * own" there has to be a way to say "serve none of these yet" that does not
 * involve editing a JSON import list and getting a merge conflict on the next
 * template update — that is what `CONNECTORS_ENABLED` is.
 *
 * SEMANTICS, chosen so the mistake is always in the safe direction:
 *
 *   unset          every shipped connector. The demo works out of the box, and
 *                  an operator who has never heard of this variable is not
 *                  surprised by an empty catalog.
 *   "a,b"          exactly a and b.
 *   "none"         nothing. An explicit empty catalog, which is what a clone
 *                  wants on day one — and it reads as a decision in the Vercel
 *                  env list, which an empty string would not.
 *
 * This is DISCOVERY, not authorization. A connector absent from the registry is
 * absent everywhere — the catalog, MCP `tools/list`, and `resolve()`, which is
 * what makes an action id in a hand-crafted request a dead end rather than a
 * way in. The policy layer still guards every action of every connector that IS
 * enabled; nothing here is a substitute for it.
 */
import { GatewayError } from "./errors"
import type { ConnectorManifest } from "./connector"

/** The value that means "serve nothing", spelled out rather than empty. */
export const NO_CONNECTORS = "none"

/** Parse the env value. Returns null for "everything", or the requested ids. */
export function parseEnabledConnectors(raw: string | undefined | null): string[] | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  if (trimmed.toLowerCase() === NO_CONNECTORS) return []
  return [...new Set(trimmed.split(",").map((id) => id.trim()).filter((id) => id.length > 0))]
}

/**
 * Apply the selection.
 *
 * An id that matches nothing THROWS rather than being skipped. A typo in this
 * variable would otherwise present as "my connector vanished from the catalog"
 * — a silence that costs an afternoon — instead of a boot failure naming the
 * id, which costs a redeploy.
 */
export function selectConnectors(
  manifests: readonly ConnectorManifest[],
  enabled: readonly string[] | null,
): ConnectorManifest[] {
  if (enabled === null) return [...manifests]

  const available = new Map(manifests.map((manifest) => [manifest.id, manifest]))
  const unknown = enabled.filter((id) => !available.has(id))
  if (unknown.length > 0) {
    throw new GatewayError(
      "INVALID_INPUT",
      `CONNECTORS_ENABLED names connectors this build does not ship: ${unknown.join(", ")}. Available: ${[...available.keys()].join(", ") || "(none)"}.`,
    )
  }
  // Iterate the manifests, not the id list: the catalog's order stays the
  // build's order however the variable happens to be written.
  return manifests.filter((manifest) => enabled.includes(manifest.id))
}
