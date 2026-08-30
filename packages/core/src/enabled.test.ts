import { describe, expect, test } from "bun:test"
import type { ConnectorManifest } from "./connector"
import { parseEnabledConnectors, selectConnectors } from "./enabled"

function manifest(id: string): ConnectorManifest {
  return {
    id,
    name: id,
    version: "0.1.0",
    executor: "cloud",
    auth: { type: "none", fields: [] },
    actions: [],
  } as unknown as ConnectorManifest
}

const SHIPPED = [manifest("alpha"), manifest("beta"), manifest("gamma")]

describe("parseEnabledConnectors", () => {
  test("unset means every shipped connector", () => {
    expect(parseEnabledConnectors(undefined)).toBeNull()
    expect(parseEnabledConnectors("")).toBeNull()
    expect(parseEnabledConnectors("   ")).toBeNull()
  })

  test('"none" is an explicit empty catalog — not the same as unset', () => {
    // The distinction is the whole point: [] is a decision, null is a default.
    expect(parseEnabledConnectors("none")).toEqual([])
    expect(parseEnabledConnectors("NONE")).toEqual([])
  })

  test("a list is trimmed and de-duplicated", () => {
    expect(parseEnabledConnectors(" alpha , beta ,alpha, ")).toEqual(["alpha", "beta"])
  })
})

describe("selectConnectors", () => {
  test("null passes everything through", () => {
    expect(selectConnectors(SHIPPED, null).map((m) => m.id)).toEqual(["alpha", "beta", "gamma"])
  })

  test("an empty list yields an empty catalog", () => {
    expect(selectConnectors(SHIPPED, [])).toEqual([])
  })

  test("selection keeps the build's order, not the variable's", () => {
    expect(selectConnectors(SHIPPED, ["gamma", "alpha"]).map((m) => m.id)).toEqual(["alpha", "gamma"])
  })

  test("an unknown id throws, naming it and what is available", () => {
    // A typo must not present as "my connector silently vanished".
    expect(() => selectConnectors(SHIPPED, ["alpha", "typo"])).toThrow(/typo/)
    expect(() => selectConnectors(SHIPPED, ["typo"])).toThrow(/alpha, beta, gamma/)
  })
})
