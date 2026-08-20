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

  test("rahmanef.com CMS exposes source-backed CRUD without inventing the unsupported upload mapping", () => {
    const manifest = byId("rahmanef")
    expect(manifest?.endpoint).toBe("https://rahmanef.com/mcp")
    expect(manifest?.auth.type).toBe("oauth2")
    expect(manifest?.actions.length).toBe(18)
    expect(manifest?.actions.some((action) => (action as typeof action & { "x-upstream"?: string })["x-upstream"] === "upload_image")).toBe(false)
    for (const action of manifest?.actions.filter((item) => item.id.endsWith(".delete")) ?? []) {
      expect(action.risk).toBe("R3")
      expect(action.annotations.destructive).toBe(true)
    }
  })
})
