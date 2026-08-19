/**
 * The guard that was missing.
 *
 * A scope only means something if all three of these agree: what a manifest
 * declares, what the issuer grants, and what `catalogFor` requires. When they
 * drifted, `careerpack`'s two actions disappeared from every caller's catalog
 * and nothing failed — no error, no log, the connector simply was not there.
 *
 * These tests fail loudly on that drift. They are deliberately written against
 * the REAL manifests the gateway registers, not fixtures: a fixture cannot
 * catch a typo in a shipped connector file.
 */
import { describe, expect, test } from "bun:test"
import { MCP_SCOPES, SCOPE_READ, SCOPE_WRITE, grantedScopes } from "@cg/core"
import { manifest as blenderManifest } from "@cg/adapter-blender"
import { REMOTE_MCP_MANIFESTS } from "@cg/adapter-remote-mcp"
import { catalogFor, createRegistry } from "@cg/registry"

const MANIFESTS = [...REMOTE_MCP_MANIFESTS, blenderManifest]

describe("scope vocabulary", () => {
  test("every scope a manifest requires is one the issuer can actually grant", () => {
    const granted = new Set(grantedScopes())
    const ungrantable: string[] = []
    for (const manifest of MANIFESTS) {
      for (const action of manifest.actions) {
        for (const scope of action.requiredScopes ?? []) {
          if (!granted.has(scope)) ungrantable.push(`${action.id} requires ${scope}`)
        }
      }
    }
    // A scope nothing grants is not a restriction — it is an action that can
    // never be reached by anyone, hidden behind a check that looks deliberate.
    expect(ungrantable).toEqual([])
  })

  test("every shipped action declares the least-privilege scope its annotation implies", () => {
    const violations: string[] = []
    for (const manifest of MANIFESTS) {
      for (const action of manifest.actions) {
        const required = action.requiredScopes ?? []
        const expected = action.annotations.readOnly ? SCOPE_READ : SCOPE_WRITE
        if (!required.includes(expected)) violations.push(`${action.id} is missing ${expected}`)
        if (action.annotations.readOnly && required.includes(SCOPE_WRITE)) {
          violations.push(`${action.id} is read-only but requires ${SCOPE_WRITE}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  test("the granted set is exactly the declared vocabulary", () => {
    expect(grantedScopes().sort()).toEqual([...MCP_SCOPES].sort())
  })
})

describe("catalog reachability", () => {
  const registry = createRegistry(MANIFESTS)
  const ids = MANIFESTS.map((m) => m.id)

  function visibleFor(scopes: string[]): Map<string, number> {
    const entries = catalogFor(registry, {
      installedConnectorIds: ids,
      connectedConnectorIds: ids,
      // Blender's actions also gate on device capabilities; supply them so this
      // test isolates the SCOPE axis rather than silently passing on absence.
      deviceCapabilities: MANIFESTS.flatMap((m) =>
        m.actions.flatMap((a) => (a.requiredCapabilities ?? []).map((c) => `${m.id}:${c}`)),
      ),
      scopes,
    })
    return new Map(entries.map((e) => [e.connector.id, e.actions.length]))
  }

  test("a credential issued by this system reaches every action of every connector", () => {
    // The regression, stated as a property: whatever the issuer hands out must
    // be enough to see the whole catalog. If a connector is missing here, it is
    // missing in production too, for everybody.
    const visible = visibleFor(grantedScopes())
    for (const manifest of MANIFESTS) {
      expect(visible.get(manifest.id), `${manifest.id} is absent from the catalog`).toBe(
        manifest.actions.length,
      )
    }
  })

  test("scopes are genuinely enforced, so the test above is not vacuous", () => {
    // Drop every scope and the scope-gated actions must disappear. If this
    // passes unchanged, `requiredScopes` is decorative and the guard above
    // proves nothing.
    const withNone = visibleFor([])
    const withAll = visibleFor(grantedScopes())
    const gated = MANIFESTS.some((m) => (withNone.get(m.id) ?? 0) < (withAll.get(m.id) ?? 0))
    expect(gated).toBe(true)
  })
})
