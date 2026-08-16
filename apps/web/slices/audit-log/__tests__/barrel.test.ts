// @vitest-environment node
/**
 * The barrel is the slice's contract with the app. This test asserts the shape
 * of that contract: nothing duplicated, nothing re-exported wholesale, nothing
 * reaching outside the slice.
 *
 * ponytail: the surface is read from the source text rather than by importing
 * `../index`, because importing it pulls in app-owned React modules and
 * `@convex/_generated/api` — app-owned modules with no vitest alias config and
 * no DOM environment installed. Upgrade path: once the app declares those
 * aliases in a vitest config, replace `barrelExports()` with
 * `Object.keys(await import("../index"))` and keep every assertion below.
 */
import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SLICE_DIR = new URL("..", import.meta.url).pathname

const barrelSource = readFileSync(join(SLICE_DIR, "index.ts"), "utf8")

function barrelExports(): string[] {
  const names: string[] = []
  for (const match of barrelSource.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    const group = match[1]
    if (group === undefined) continue
    for (const part of group.split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (name !== undefined && name.length > 0) names.push(name)
    }
  }
  return names
}

describe("barrel surface", () => {
  test("no name is exported twice", () => {
    const names = barrelExports()
    expect(new Set(names).size).toBe(names.length)
  })

  test("DENIED: the barrel never re-exports a whole module", () => {
    expect(barrelSource).not.toMatch(/export\s+\*/)
    expect(barrelSource).not.toMatch(/export\s+default/)
  })

  test("DENIED: the barrel never reaches outside the slice", () => {
    for (const match of barrelSource.matchAll(/from\s+"([^"]+)"/g)) {
      expect(match[1]).toMatch(/^\.\//)
    }
  })
})

describe("convex contract", () => {
  test("DENIED: no service-token function is reachable from the browser", () => {
    const functionsSource = readFileSync(join(SLICE_DIR, "config", "functions.ts"), "utf8")
    expect(functionsSource).not.toContain("service/")
    expect(functionsSource).not.toContain("api.service")
    expect(functionsSource).not.toContain("serviceToken")
  })
})
