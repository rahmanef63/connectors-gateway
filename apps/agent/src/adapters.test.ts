import { describe, expect, test } from "bun:test"
import type { ActionDefinition, CapabilityReport } from "@cg/core"
import type { LocalAdapter } from "@cg/sdk"
import { createAdapterRegistry, createDefaultRegistry, qualifyCapability } from "./adapters"

const renderAction: ActionDefinition = {
  id: "blender.scene.render",
  title: "Render",
  description: "Render the current scene.",
  inputSchema: { type: "object" },
  risk: "R2",
  annotations: { readOnly: false, destructive: false },
  requiredCapabilities: ["scene.render"],
}

function adapter(id: string, report: CapabilityReport | (() => Promise<CapabilityReport>)): LocalAdapter {
  return {
    manifest: { id, name: id, version: "0.1.0", executor: "local", auth: { type: "device" }, actions: [renderAction] },
    detect: typeof report === "function" ? report : async () => report,
    execute: async () => ({ output: null }),
  }
}

const available: CapabilityReport = {
  connector: "blender",
  status: "available",
  adapterVersion: "0.1.0",
  capabilities: ["scene.render"],
}

describe("qualifyCapability", () => {
  test("namespaces a relative capability and leaves a qualified one alone", () => {
    expect(qualifyCapability("blender", "scene.render")).toBe("blender:scene.render")
    expect(qualifyCapability("blender", "blender:scene.render")).toBe("blender:scene.render")
  })
})

describe("createAdapterRegistry", () => {
  test("detects, indexes and namespaces available capabilities", async () => {
    const registry = createAdapterRegistry([adapter("blender", available)])
    expect(registry.available().capabilities.size).toBe(0)

    const reports = await registry.detectAll()
    expect(reports).toEqual([available])
    expect(registry.available().capabilities.has("blender:scene.render")).toBe(true)
    expect(registry.available().connectors.has("blender")).toBe(true)
    expect(registry.findAction("blender", "blender.scene.render")).toEqual(renderAction)
    expect(registry.findAction("blender", "blender.scene.nuke")).toBeUndefined()
    expect(registry.findAction("nope", "blender.scene.render")).toBeUndefined()
  })

  test("an unavailable adapter contributes no capabilities", async () => {
    const registry = createAdapterRegistry([
      adapter("blender", { connector: "blender", status: "unavailable", adapterVersion: "0.1.0", capabilities: ["scene.render"] }),
    ])
    await registry.detectAll()
    expect(registry.available().capabilities.size).toBe(0)
    expect(registry.available().connectors.size).toBe(0)
  })

  test("a detect() that throws degrades to unavailable instead of taking the agent down", async () => {
    const registry = createAdapterRegistry([
      adapter("blender", async () => {
        throw new Error("bridge exploded")
      }),
    ])
    const reports = await registry.detectAll()
    expect(reports[0]).toEqual({
      connector: "blender",
      status: "unavailable",
      adapterVersion: "0.1.0",
      capabilities: [],
    })
  })

  test("re-detecting replaces the previous report", async () => {
    let status: CapabilityReport["status"] = "available"
    const registry = createAdapterRegistry([
      adapter("blender", async () => ({ ...available, status })),
    ])
    await registry.detectAll()
    expect(registry.available().capabilities.size).toBe(1)
    status = "unavailable"
    await registry.detectAll()
    expect(registry.available().capabilities.size).toBe(0)
  })
})

describe("createDefaultRegistry", () => {
  test("registers the blender adapter against a loopback bridge", () => {
    const registry = createDefaultRegistry({ BLENDER_BRIDGE_URL: "http://127.0.0.1:9876" })
    expect(registry.list()).toHaveLength(1)
    expect(registry.get("blender")?.manifest.id).toBe("blender")
  })

  test("DENIED: a non-loopback bridge URL refuses to start (AGENTS.md invariant 3)", () => {
    expect(() => createDefaultRegistry({ BLENDER_BRIDGE_URL: "http://10.0.0.5:9876" })).toThrow()
    expect(() => createDefaultRegistry({ BLENDER_BRIDGE_URL: "http://blender.example.com" })).toThrow()
  })
})
