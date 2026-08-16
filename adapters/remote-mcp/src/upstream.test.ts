import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { ConnectorManifest } from "@cg/core"
import { UPSTREAM_KEY, resolveUpstreamTool } from "./upstream"

function manifestWith(actions: Record<string, unknown>[]): ConnectorManifest {
  return {
    id: "fixture",
    name: "Fixture",
    version: "0.1.0",
    executor: "cloud",
    auth: { type: "bearer" },
    actions,
  } as unknown as ConnectorManifest
}

const action = (id: string, upstream?: unknown): Record<string, unknown> => ({
  id,
  title: "T",
  description: "D",
  inputSchema: { type: "object" },
  risk: "R0",
  annotations: { readOnly: true, destructive: false },
  ...(upstream === undefined ? {} : { [UPSTREAM_KEY]: upstream }),
})

describe("resolveUpstreamTool", () => {
  test("reads the tool name off the manifest action", () => {
    const manifest = manifestWith([action("a.thing.read", "thing_get"), action("a.thing.create", "things_create")])

    expect(resolveUpstreamTool(manifest, "a.thing.read")).toBe("thing_get")
    expect(resolveUpstreamTool(manifest, "a.thing.create")).toBe("things_create")
  })

  test("an action the manifest does not declare is ACTION_NOT_FOUND", () => {
    const manifest = manifestWith([action("a.thing.read", "thing_get")])

    let thrown: unknown
    try {
      resolveUpstreamTool(manifest, "a.thing.delete")
    } catch (cause) {
      thrown = cause
    }
    expect(thrown).toBeInstanceOf(GatewayError)
    expect((thrown as GatewayError).code).toBe("ACTION_NOT_FOUND")
  })

  /**
   * The denied case the whole keyword exists for. Deriving `thing_read` from
   * `a.thing.read` would look right and call a tool the manifest never named — and on a
   * server that publishes both `thing_read` and `thing_delete`, a near-miss guess is a
   * silent wrong call rather than a 404.
   */
  test("a declared action carrying no x-upstream is ACTION_NOT_FOUND, never a guess", () => {
    const manifest = manifestWith([action("a.thing.read")])

    expect(() => resolveUpstreamTool(manifest, "a.thing.read")).toThrow(GatewayError)
    try {
      resolveUpstreamTool(manifest, "a.thing.read")
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("ACTION_NOT_FOUND")
    }
  })

  test("a non-string or empty x-upstream is refused, not coerced", () => {
    for (const bad of ["", 42, null, ["thing_get"], { name: "thing_get" }, true]) {
      const manifest = manifestWith([action("a.thing.read", bad)])
      expect(() => resolveUpstreamTool(manifest, "a.thing.read")).toThrow(GatewayError)
    }
  })

  test("the caller-supplied id is never echoed back to the client", () => {
    const manifest = manifestWith([action("a.thing.read", "thing_get")])

    let thrown: unknown
    try {
      resolveUpstreamTool(manifest, "a.<script>.read")
    } catch (cause) {
      thrown = cause
    }
    expect((thrown as GatewayError).message).not.toContain("<script>")
  })

  /** An id lookup must not walk Object.prototype: `toString` is not an action. */
  test("a prototype key does not resolve to a tool", () => {
    const manifest = manifestWith([action("a.thing.read", "thing_get")])

    expect(() => resolveUpstreamTool(manifest, "toString")).toThrow(GatewayError)
    expect(() => resolveUpstreamTool(manifest, "constructor")).toThrow(GatewayError)
  })

  test("an empty manifest resolves nothing", () => {
    expect(() => resolveUpstreamTool(manifestWith([]), "a.thing.read")).toThrow(GatewayError)
  })
})
