import { describe, expect, test } from "vitest"
import { catalogEntries, manifestFor } from "./catalog"

describe("shipped connector catalog", () => {
  test("includes the additional production Content and rahmanef.com connectors", () => {
    const entries = catalogEntries()
    const content = entries.find((entry) => entry.id === "content")
    const rahmanef = entries.find((entry) => entry.id === "rahmanef")

    expect(content).toMatchObject({
      name: "Content — Social Content OS",
      executor: "cloud",
      authType: "oauth2",
      endpoint: "https://cautious-dog-955.convex.site/mcp",
      actionCount: 12,
      topRisk: "R3",
    })
    expect(rahmanef).toMatchObject({
      name: "rahmanef.com CMS",
      executor: "cloud",
      authType: "oauth2",
      endpoint: "https://rahmanef.com/mcp",
      actionCount: 18,
      topRisk: "R3",
    })
  })

  test("catalog ordering stays stable and hand-crafted ids still resolve to nothing", () => {
    const names = catalogEntries().map((entry) => entry.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(manifestFor("not-a-shipped-connector")).toBeNull()
  })
})
