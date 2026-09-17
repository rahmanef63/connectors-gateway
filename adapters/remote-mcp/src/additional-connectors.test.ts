import { describe, expect, test } from "bun:test"
import { REMOTE_MCP_MANIFESTS } from "./connectors"

const byId = (id: string) => REMOTE_MCP_MANIFESTS.find((manifest) => manifest.id === id)

describe("additional production connectors", () => {
  test("Content OS is OAuth-backed and keeps public publishing actions behind write scope + approval risk", () => {
    const manifest = byId("content")
    expect(manifest?.endpoint).toBe("https://cautious-dog-955.convex.site/mcp")
    expect(manifest?.auth.type).toBe("oauth2")
    expect(manifest?.actions.length).toBe(12)
    const publish = manifest?.actions.find((action) => action.id === "content.publish.queue")
    const reply = manifest?.actions.find((action) => action.id === "content.inbox.reply")
    for (const action of [publish, reply]) {
      expect(action?.risk).toBe("R3")
      expect(action?.annotations.destructive).toBe(true)
      expect(action?.requiredScopes).toEqual(["mcp.write"])
    }
  })

  test("the personal website is not distributed as a public connector", () => {
    expect(byId("rahmanef")).toBeUndefined()
    for (const manifest of REMOTE_MCP_MANIFESTS) {
      if (manifest.endpoint) {
        expect(new URL(manifest.endpoint).hostname).not.toBe("rahmanef.com")
        expect(new URL(manifest.endpoint).hostname).not.toBe("www.rahmanef.com")
      }
      expect(manifest.actions.some((action) => action.id.startsWith("rahmanef."))).toBe(false)
    }
    // Public products on subdomains are distinct from the personal website.
    expect(byId("mso")?.endpoint).toBe("https://mso.rahmanef.com/mcp")
    for (const id of ["careerpack", "composio", "content", "example"]) {
      expect(byId(id)).toBeDefined()
    }
  })
})
