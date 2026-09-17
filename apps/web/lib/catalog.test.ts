import { describe, expect, test } from "vitest"
import { catalogEntries, manifestFor } from "./catalog"

describe("shipped connector catalog", () => {
  test("includes the public Content connector without the personal website", () => {
    const entries = catalogEntries()
    const content = entries.find((entry) => entry.id === "content")

    expect(content).toMatchObject({
      name: "Content — Social Content OS",
      executor: "cloud",
      authType: "oauth2",
      endpoint: "https://cautious-dog-955.convex.site/mcp",
      actionCount: 12,
      topRisk: "R3",
    })
    expect(entries.some((entry) => entry.id === "rahmanef")).toBe(false)
    expect(entries.some((entry) => entry.endpoint === "https://rahmanef.com/mcp")).toBe(false)
    expect(manifestFor("rahmanef")).toBeNull()
  })

  test("catalog ordering stays stable and hand-crafted ids still resolve to nothing", () => {
    const names = catalogEntries().map((entry) => entry.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(manifestFor("not-a-shipped-connector")).toBeNull()
  })
})
