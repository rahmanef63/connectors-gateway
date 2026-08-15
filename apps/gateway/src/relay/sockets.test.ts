import { describe, expect, test } from "bun:test"
import { createSocketRegistry } from "./sockets"
import { newSocketState } from "./types"
import type { RelaySocket } from "./types"

function socket(id: string): RelaySocket {
  return { data: newSocketState(id, 0), send: () => 0, close: () => {} } as unknown as RelaySocket
}

describe("createSocketRegistry", () => {
  test("registers and finds a socket by device id", () => {
    const registry = createSocketRegistry()
    const first = socket("a")
    expect(registry.set("dev_1", first)).toBeUndefined()
    expect(registry.get("dev_1")).toBe(first)
    expect(registry.size()).toBe(1)
  })

  test("a reconnect returns the displaced socket so it can be closed", () => {
    const registry = createSocketRegistry()
    const first = socket("a")
    const second = socket("b")
    registry.set("dev_1", first)
    expect(registry.set("dev_1", second)).toBe(first)
    expect(registry.get("dev_1")).toBe(second)
    expect(registry.size()).toBe(1)
  })

  test("re-setting the SAME socket displaces nothing", () => {
    const registry = createSocketRegistry()
    const only = socket("a")
    registry.set("dev_1", only)
    expect(registry.set("dev_1", only)).toBeUndefined()
  })

  test("the old socket's close cannot deregister the new one", () => {
    const registry = createSocketRegistry()
    const first = socket("a")
    const second = socket("b")
    registry.set("dev_1", first)
    registry.set("dev_1", second)

    expect(registry.remove("dev_1", first)).toBe(false)
    expect(registry.get("dev_1")).toBe(second)
    expect(registry.remove("dev_1", second)).toBe(true)
    expect(registry.get("dev_1")).toBeUndefined()
  })

  test("removing an unknown device is a no-op", () => {
    const registry = createSocketRegistry()
    expect(registry.remove("dev_x", socket("a"))).toBe(false)
  })
})
