// @vitest-environment node
/**
 * The barrel is the slice's contract with the app, and `slice.json` is the
 * written form of it. This test asserts the two agree, in both directions.
 *
 * ponytail: the surface is read from the source text rather than by importing
 * `../index`, because importing it pulls in the app's design-system modules
 * (`@/components/status-badge`, `skeleton`, `empty-state`, `toast`) and
 * `@convex/_generated/api` — app-owned modules with no DOM environment
 * installed here. Upgrade path: once a DOM environment is available, replace
 * `barrelExports()` with
 * `Object.keys(await import("../index"))` and keep every assertion below.
 */
import { describe, expect, test } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const SLUG = "devices"
const SLICE_DIR = new URL("..", import.meta.url).pathname

type SliceContract = {
  name: string
  version: string
  kind: string
  description: string
  contract: {
    exports: Record<string, string[]>
    requires: Record<string, unknown>
    props: Record<string, unknown>
    convexFunctions: { queries: string[]; mutations: string[] }
  }
}

type SliceManifest = {
  name: string
  version: string
  files: string[]
  dependencies: Record<string, string>
}

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(join(SLICE_DIR, fileName), "utf8")) as T
}

const contract = readJson<SliceContract>("slice.json")
const manifest = readJson<SliceManifest>("slice.manifest.json")
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

function declaredExports(): string[] {
  return Object.values(contract.contract.exports).flat()
}

describe("slice metadata pair", () => {
  test("slice.json name matches the directory", () => {
    expect(contract.name).toBe(SLUG)
    expect(manifest.name).toBe(SLUG)
  })

  test("slice.json and slice.manifest.json agree on version", () => {
    expect(contract.version).toBe(manifest.version)
    expect(contract.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test("slice.json carries the contract block", () => {
    expect(contract.kind).toBe("slice")
    expect(contract.description.length).toBeGreaterThan(0)
    expect(Object.keys(contract.contract).sort()).toEqual([
      "convexFunctions",
      "exports",
      "props",
      "requires",
    ])
  })

  test("every manifest file exists", () => {
    expect(manifest.files.length).toBeGreaterThan(0)
    for (const file of manifest.files) {
      expect(existsSync(join(SLICE_DIR, file)), file).toBe(true)
    }
  })

  test("the manifest lists the required slice files", () => {
    for (const required of ["index.ts", "types.ts", "slice.json", "slice.manifest.json"]) {
      expect(manifest.files).toContain(required)
    }
  })
})

describe("barrel surface", () => {
  test("exports exactly what slice.json declares", () => {
    expect(barrelExports().sort()).toEqual(declaredExports().sort())
  })

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

  test("the declared components, hooks and values are the mountable surface", () => {
    expect(contract.contract.exports.components).toContain("DevicesPanel")
    expect(contract.contract.exports.components).toContain("PairApprovalPanel")
    expect(contract.contract.exports.hooks).toEqual([
      "useRevokeDevice",
      "useRenameDevice",
      "useApprovePairing",
    ])
  })
})

describe("convex contract", () => {
  test("every declared function uses the pinned module:function form", () => {
    const all = [...contract.contract.convexFunctions.queries, ...contract.contract.convexFunctions.mutations]
    expect(all.length).toBeGreaterThan(0)
    for (const name of all) {
      expect(name).toMatch(/^features\/[a-z-]+\/(queries|mutations):[a-zA-Z]+$/)
    }
  })

  test("the pinned names are the ones the slice actually calls", () => {
    const functionsSource = readFileSync(join(SLICE_DIR, "config", "functions.ts"), "utf8")
    for (const name of [
      ...contract.contract.convexFunctions.queries,
      ...contract.contract.convexFunctions.mutations,
    ]) {
      const [modulePath, functionName] = name.split(":")
      const reference = `api.${(modulePath ?? "").split("/").join(".")}.${functionName ?? ""}`
      expect(functionsSource, name).toContain(reference)
    }
  })

  test("DENIED: no service-token function is reachable from the browser", () => {
    const functionsSource = readFileSync(join(SLICE_DIR, "config", "functions.ts"), "utf8")
    expect(functionsSource).not.toContain("service/")
    expect(functionsSource).not.toContain("api.service")
    expect(functionsSource).not.toContain("serviceToken")
  })
})
