import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { ConnectorManifest } from "@cg/core"
import { createRegistry } from "./registry"

function manifest(
  id: string,
  actionIds: string[],
  executor: ConnectorManifest["executor"] = "cloud",
): ConnectorManifest {
  return {
    id,
    name: id,
    version: "0.1.0",
    executor,
    auth: { type: "none" },
    actions: actionIds.map((actionId) => ({
      id: actionId,
      title: actionId,
      description: actionId,
      inputSchema: { type: "object", additionalProperties: false },
      risk: "R0",
      annotations: { readOnly: true, destructive: false },
    })),
  }
}

/**
 * A stand-in for the shipped Blender manifest. The real one is TypeScript
 * (`@cg/adapter-blender`), and importing it here would invert the
 * package -> adapter dependency direction; that the shipped manifests are
 * well-formed is proven in packages/schemas/src/manifest.test.ts and again at
 * gateway boot, where createRegistry runs over the real ones.
 */
function localManifest(): ConnectorManifest {
  const base = manifest("blender", ["blender.scene.render"], "local")
  const action = base.actions[0]
  if (action === undefined) throw new Error("unreachable")
  action.risk = "R2"
  action.requiredCapabilities = ["scene.render"]
  action.annotations = { readOnly: false, destructive: false }
  return base
}

function expectThrows(build: () => unknown): GatewayError {
  try {
    build()
  } catch (error) {
    expect(error).toBeInstanceOf(GatewayError)
    return error as GatewayError
  }
  throw new Error("expected a GatewayError")
}

describe("createRegistry", () => {
  test("indexes several connectors", () => {
    const registry = createRegistry([manifest("careerpack", ["careerpack.profile.read"]), localManifest()])

    expect(registry.list().map((connector) => connector.id)).toEqual(["careerpack", "blender"])
    expect(registry.get("blender")?.executor).toBe("local")
    expect(registry.get("nope")).toBeUndefined()
  })

  test("list() hands out a copy, so a caller cannot mutate the registry", () => {
    const registry = createRegistry([manifest("a", ["a.one"])])
    registry.list().pop()
    expect(registry.list()).toHaveLength(1)
  })

  test("refuses to boot on a manifest missing an inputSchema", () => {
    const broken = manifest("a", ["a.one"]) as unknown as Record<string, unknown>
    const actions = broken["actions"] as Record<string, unknown>[]
    delete actions[0]?.["inputSchema"]

    const error = expectThrows(() => createRegistry([broken as unknown as ConnectorManifest]))
    expect(error.code).toBe("INVALID_INPUT")
    expect(error.message).toContain("required:inputSchema")
  })

  test("rejects duplicate connector ids", () => {
    const error = expectThrows(() => createRegistry([manifest("a", ["a.one"]), manifest("a", ["a.two"])]))
    expect(error.code).toBe("INVALID_INPUT")
    expect(error.message).toContain("Duplicate connector id: a")
  })

  test("rejects duplicate action ids inside one connector", () => {
    const error = expectThrows(() => createRegistry([manifest("a", ["a.one", "a.one"])]))
    expect(error.message).toContain("Duplicate action id: a.one")
  })

  test("rejects duplicate action ids across connectors", () => {
    const error = expectThrows(() =>
      createRegistry([manifest("a", ["shared.action"]), manifest("b", ["shared.action"])]),
    )
    expect(error.message).toContain("Duplicate action id: shared.action")
  })

  test("rejects a non-array argument", () => {
    expect(expectThrows(() => createRegistry(undefined as unknown as ConnectorManifest[])).code).toBe(
      "INVALID_INPUT",
    )
  })
})

describe("resolve", () => {
  const registry = createRegistry([localManifest()])

  test("returns the connector and the action", () => {
    const resolved = registry.resolve("blender", "blender.scene.render")
    expect(resolved.connector.id).toBe("blender")
    expect(resolved.action.risk).toBe("R2")
    expect(resolved.action.requiredCapabilities).toEqual(["scene.render"])
  })

  test("unknown connector produces CONNECTOR_NOT_FOUND", () => {
    const error = expectThrows(() => registry.resolve("careerpack", "blender.scene.render"))
    expect(error.code).toBe("CONNECTOR_NOT_FOUND")
    expect(error.httpStatus).toBe(404)
  })

  test("unknown action produces ACTION_NOT_FOUND", () => {
    const error = expectThrows(() => registry.resolve("blender", "blender.python.execute"))
    expect(error.code).toBe("ACTION_NOT_FOUND")
  })

  test("an action of another connector does not resolve", () => {
    expect(expectThrows(() => registry.resolve("blender", "careerpack.profile.read")).code).toBe(
      "ACTION_NOT_FOUND",
    )
  })

  test("never echoes caller-supplied ids back into the message", () => {
    const probe = "<script>alert(1)</script>token_abc"
    expect(expectThrows(() => registry.resolve(probe, probe)).message).not.toContain(probe)
    expect(expectThrows(() => registry.resolve("blender", probe)).message).not.toContain(probe)
  })
})
