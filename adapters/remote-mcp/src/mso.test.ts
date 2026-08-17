/**
 * The mso connector's one non-negotiable property, pinned.
 *
 * mso publishes 17 tools across three scope tiers. Two of them sit in its
 * `exec` tier — `exec_run` is arbitrary remote shell on the VPS this whole
 * platform runs on, and `browser_power` drives a session holding live logins.
 * `AGENTS.md` invariant 7 disables that class by default, and
 * `docs/16-connector-strategy.md` decided the shape before anything was built:
 * connect mso read/write only, and OMIT the exec tier from the manifest
 * entirely rather than ship it disabled.
 *
 * Absent beats disabled. A disabled action is one policy edit away from being
 * live; an action with no manifest entry cannot be reached by editing policy,
 * because `lookupTool` resolves names against the catalog and an unlisted name
 * never becomes an action id.
 */
import { describe, expect, test } from "bun:test"
import { REMOTE_MCP_MANIFESTS } from "./connectors"

const mso = REMOTE_MCP_MANIFESTS.find((m) => m.id === "mso")

/** Upstream tool names that must never appear, whatever the local id is. */
const FORBIDDEN_UPSTREAM = ["exec_run", "browser_power"]

describe("mso connector", () => {
  test("is registered", () => {
    expect(mso, "mso manifest is not registered").toBeTruthy()
  })

  test("exposes no exec-tier tool, under any local name", () => {
    // Checked against `x-upstream`, not the local id: renaming the action would
    // slip past a check on `mso.exec.run` while still calling the same shell.
    const upstream = (mso?.actions ?? []).map((a) => (a as { "x-upstream"?: string })["x-upstream"])
    for (const banned of FORBIDDEN_UPSTREAM) {
      expect(upstream, `${banned} must not be exposed`).not.toContain(banned)
    }
  })

  test("declares no R4 action", () => {
    expect((mso?.actions ?? []).filter((a) => a.risk === "R4")).toEqual([])
  })

  test("every destructive action is rated R3 so it reaches the approval gate", () => {
    // R0/R1 auto-allow. A destructive action rated below R2 would delete files
    // on the VPS with no human in the loop.
    const underRated = (mso?.actions ?? [])
      .filter((a) => a.annotations.destructive)
      .filter((a) => a.risk !== "R3")
      .map((a) => a.id)
    expect(underRated).toEqual([])
  })

  test("deleting and power-cycling are both marked destructive", () => {
    // The inverse of the test above: it is vacuous if nothing is destructive.
    const destructive = (mso?.actions ?? []).filter((a) => a.annotations.destructive).map((a) => a.id)
    expect(destructive.sort()).toEqual(["mso.apps.power", "mso.fs.delete"])
  })

  test("no read-only action requires the write scope, and no writer claims read-only", () => {
    for (const action of mso?.actions ?? []) {
      const scopes = action.requiredScopes ?? []
      expect(scopes, action.id).toEqual(action.annotations.readOnly ? ["mcp.read"] : ["mcp.write"])
    }
  })

  test("points at the production host over https", () => {
    expect((mso as { endpoint?: string } | undefined)?.endpoint).toBe("https://mso.rahmanef.com/mcp")
  })
})
