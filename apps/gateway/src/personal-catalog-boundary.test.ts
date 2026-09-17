import { describe, expect, test } from "bun:test"
import { REMOTE_MCP_MANIFESTS } from "@cg/adapter-remote-mcp"
import { createRegistry } from "@cg/registry"
import { GatewayError, selectConnectors } from "@cg/core"

describe("personal website exclusion from the public gateway", () => {
  test("the removed connector cannot resolve even when an old connection id is supplied", () => {
    const registry = createRegistry([...REMOTE_MCP_MANIFESTS])
    expect(registry.get("rahmanef")).toBeUndefined()
    try {
      registry.resolve("rahmanef", "rahmanef.posts.list")
      throw new Error("personal connector unexpectedly resolved")
    } catch (error) {
      expect(error).toBeInstanceOf(GatewayError)
      expect((error as GatewayError).code).toBe("CONNECTOR_NOT_FOUND")
    }
    expect(registry.resolve("careerpack", "careerpack.profile.read").connector.id).toBe("careerpack")
  })

  test("an old explicit enabled list cannot silently reactivate the removed connector", () => {
    expect(() => selectConnectors(REMOTE_MCP_MANIFESTS, ["rahmanef"])).toThrow("does not ship")
  })
})
