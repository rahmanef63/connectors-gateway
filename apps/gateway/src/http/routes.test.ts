import { describe, expect, test } from "bun:test"
import { matchRoute, ROUTES } from "./routes"

describe("matchRoute", () => {
  test("matches every declared route", () => {
    for (const route of ROUTES) {
      const path = route.pattern.replaceAll(/:([a-z]+)/g, "x")
      expect(matchRoute(route.method, path)).not.toBeNull()
    }
  })

  test("captures action path parameters", () => {
    const match = matchRoute("POST", "/v1/actions/blender/blender.scene.render")
    expect(match).toMatchObject({ params: { connector: "blender", action: "blender.scene.render" } })
  })

  test("percent-encoded segments are decoded once", () => {
    const match = matchRoute("POST", "/v1/actions/blender/scene%2Erender")
    expect(match).toMatchObject({ params: { action: "scene.render" } })
  })

  test("an unknown path is null", () => {
    expect(matchRoute("GET", "/admin")).toBeNull()
    expect(matchRoute("GET", "/v1/actions")).toBeNull()
  })

  test("a wrong verb reports a method mismatch, not a 404", () => {
    expect(matchRoute("GET", "/mcp")).toEqual({ methodMismatch: true })
    expect(matchRoute("DELETE", "/healthz")).toEqual({ methodMismatch: true })
  })

  test("a traversal attempt does not match a parameterised route", () => {
    expect(matchRoute("POST", "/v1/actions/../../etc/passwd")).toBeNull()
  })

  test("trailing slashes are tolerated", () => {
    expect(matchRoute("GET", "/healthz/")).not.toBeNull()
  })
})
