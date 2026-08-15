import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { ActionDefinition, ConnectorManifest } from "@cg/core"
import { capabilityKey, catalogFor } from "./catalog"
import type { CatalogInput } from "./catalog"
import { createRegistry } from "./registry"

function action(
  id: string,
  extra: Partial<Pick<ActionDefinition, "requiredScopes" | "requiredCapabilities">> = {},
): ActionDefinition {
  return {
    id,
    title: id,
    description: id,
    inputSchema: { type: "object", additionalProperties: false },
    risk: "R0",
    annotations: { readOnly: true, destructive: false },
    ...extra,
  }
}

const careerpack: ConnectorManifest = {
  id: "careerpack",
  name: "CareerPack",
  version: "0.1.0",
  executor: "cloud",
  auth: { type: "oauth2" },
  actions: [
    action("careerpack.profile.read", { requiredScopes: ["careerpack.read"] }),
    action("careerpack.application.create", { requiredScopes: ["careerpack.write"] }),
  ],
}

const blender: ConnectorManifest = {
  id: "blender",
  name: "Blender",
  version: "0.1.0",
  executor: "local",
  auth: { type: "device" },
  actions: [
    action("blender.scene.inspect", { requiredCapabilities: ["scene.inspect"] }),
    action("blender.scene.render", { requiredCapabilities: ["scene.render"] }),
  ],
}

const registry = createRegistry([careerpack, blender])

const FULL: CatalogInput = {
  installedConnectorIds: ["careerpack", "blender"],
  connectedConnectorIds: ["careerpack", "blender"],
  deviceCapabilities: ["blender:scene.inspect", "blender:scene.render"],
  scopes: ["careerpack.read", "careerpack.write"],
}

function actionIds(input: CatalogInput): string[] {
  return catalogFor(registry, input).flatMap((entry) => entry.actions.map((item) => item.id))
}

describe("catalogFor", () => {
  test("everything satisfied lists every action", () => {
    expect(actionIds(FULL)).toEqual([
      "careerpack.profile.read",
      "careerpack.application.create",
      "blender.scene.inspect",
      "blender.scene.render",
    ])
  })

  test("hides an action whose device capability is missing", () => {
    const ids = actionIds({ ...FULL, deviceCapabilities: ["blender:scene.inspect"] })
    expect(ids).toContain("blender.scene.inspect")
    expect(ids).not.toContain("blender.scene.render")
  })

  test("hides an action whose scope is missing", () => {
    const ids = actionIds({ ...FULL, scopes: ["careerpack.read"] })
    expect(ids).toContain("careerpack.profile.read")
    expect(ids).not.toContain("careerpack.application.create")
  })

  test("drops a connector entirely once no action survives", () => {
    const entries = catalogFor(registry, { ...FULL, deviceCapabilities: [] })
    expect(entries.map((entry) => entry.connector.id)).toEqual(["careerpack"])
  })

  test("a connector that is not installed is invisible even when connected", () => {
    const ids = actionIds({ ...FULL, installedConnectorIds: ["careerpack"] })
    expect(ids.every((id) => id.startsWith("careerpack."))).toBe(true)
  })

  test("an installed connector with no connection is invisible", () => {
    const ids = actionIds({ ...FULL, connectedConnectorIds: ["blender"] })
    expect(ids.every((id) => id.startsWith("blender."))).toBe(true)
  })

  test("capabilities are namespaced — another connector's capability does not satisfy blender", () => {
    const ids = actionIds({
      ...FULL,
      deviceCapabilities: ["scene.render", "careerpack:scene.render"],
    })
    expect(ids).not.toContain("blender.scene.render")
  })

  test("nothing installed yields an empty catalog", () => {
    expect(catalogFor(registry, { ...FULL, installedConnectorIds: [] })).toEqual([])
  })

  test("rejects a malformed catalog input", () => {
    for (const broken of [
      { ...FULL, scopes: "careerpack.read" },
      { ...FULL, deviceCapabilities: [null] },
      { ...FULL, installedConnectorIds: undefined },
    ]) {
      try {
        catalogFor(registry, broken as unknown as CatalogInput)
        throw new Error("expected catalogFor to throw")
      } catch (error) {
        expect(error).toBeInstanceOf(GatewayError)
        expect((error as GatewayError).code).toBe("INVALID_INPUT")
      }
    }
  })
})

describe("capabilityKey", () => {
  test("namespaces a connector-relative capability", () => {
    expect(capabilityKey("blender", "scene.render")).toBe("blender:scene.render")
  })

  test("leaves an already-namespaced capability alone", () => {
    expect(capabilityKey("blender", "blender:scene.render")).toBe("blender:scene.render")
  })
})
