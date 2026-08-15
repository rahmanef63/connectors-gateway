import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { canonicalJson } from "./canonical"

function expectInvalid(fn: () => unknown): void {
  let thrown: unknown
  try {
    fn()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(GatewayError)
  expect((thrown as GatewayError).code).toBe("INVALID_INPUT")
}

describe("canonicalJson determinism", () => {
  test("is stable across calls", () => {
    const value = { b: [1, 2, { z: true, a: null }], a: "x" }
    expect(canonicalJson(value)).toBe(canonicalJson(value))
    expect(canonicalJson(value)).toBe(canonicalJson(structuredClone(value)))
  })

  test("is independent of key insertion order, recursively", () => {
    const first = { a: 1, b: { c: 2, d: [{ e: 3, f: 4 }] } }
    const second = { b: { d: [{ f: 4, e: 3 }], c: 2 }, a: 1 }
    expect(canonicalJson(first)).toBe(canonicalJson(second))
    expect(canonicalJson(first)).toBe('{"a":1,"b":{"c":2,"d":[{"e":3,"f":4}]}}')
  })

  test("preserves array order", () => {
    expect(canonicalJson([1, 2, 3])).toBe("[1,2,3]")
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]))
  })

  test("drops undefined-valued keys", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}')
    expect(canonicalJson({ a: undefined })).toBe("{}")
  })

  test("normalizes -0 to 0", () => {
    expect(canonicalJson({ a: -0 })).toBe('{"a":0}')
  })

  test("survives a JSON round trip", () => {
    const value = { nested: { list: [1, "two", false, null] }, unicode: "héllo  😀" }
    const once = canonicalJson(value)
    expect(canonicalJson(JSON.parse(once))).toBe(once)
  })
})

describe("canonicalJson injectivity", () => {
  // Two values a verifier would treat as different must never share a preimage.
  const distinct: [string, unknown, unknown][] = [
    ["string vs number", { a: "1" }, { a: 1 }],
    ["nesting vs dotted key", { a: { b: 1 } }, { "a.b": 1 }],
    ["quote smuggling", { a: 'x","b":"y' }, { a: "x", b: "y" }],
    ["comma smuggling", { "a,b": 1 }, { a: 1, b: 1 }],
    ["array vs object", [1], { 0: 1 }],
    ["null vs string null", { a: null }, { a: "null" }],
    ["empty vs missing", { a: "" }, {}],
    ["bool vs string", { a: true }, { a: "true" }],
    ["nested empty containers", { a: [] }, { a: {} }],
    ["number precision", { a: 1 }, { a: 1.0000000000000002 }],
    ["key vs value swap", { a: "b" }, { b: "a" }],
    ["unicode escape", { a: "\\u0041" }, { a: "A" }],
  ]

  for (const [name, left, right] of distinct) {
    test(`separates ${name}`, () => {
      expect(canonicalJson(left)).not.toBe(canonicalJson(right))
    })
  }

  test("escapes keys, so a crafted key cannot forge structure", () => {
    expect(canonicalJson({ '":1,"forged': 2 })).toBe('{"\\":1,\\"forged":2}')
  })
})

describe("canonicalJson rejection", () => {
  test("rejects a direct cycle", () => {
    const value: Record<string, unknown> = { a: 1 }
    value.self = value
    expectInvalid(() => canonicalJson(value))
  })

  test("rejects an indirect cycle through an array", () => {
    const inner: unknown[] = []
    const outer = { inner }
    inner.push(outer)
    expectInvalid(() => canonicalJson(outer))
  })

  test("allows the same object twice when it is not an ancestor", () => {
    const shared = { a: 1 }
    expect(canonicalJson({ x: shared, y: shared })).toBe('{"x":{"a":1},"y":{"a":1}}')
  })

  test("rejects non-finite numbers", () => {
    expectInvalid(() => canonicalJson({ a: Number.NaN }))
    expectInvalid(() => canonicalJson({ a: Number.POSITIVE_INFINITY }))
    expectInvalid(() => canonicalJson([Number.NEGATIVE_INFINITY]))
  })

  test("rejects undefined inside an array so it cannot collide with null", () => {
    expectInvalid(() => canonicalJson([undefined]))
    expect(canonicalJson([null])).toBe("[null]")
  })

  test("rejects values with no JSON representation", () => {
    expectInvalid(() => canonicalJson(undefined))
    expectInvalid(() => canonicalJson(() => 1))
    expectInvalid(() => canonicalJson(10n))
    expectInvalid(() => canonicalJson(Symbol("s")))
  })

  test("rejects non-plain objects that would collapse to {}", () => {
    expectInvalid(() => canonicalJson(new Date(0)))
    expectInvalid(() => canonicalJson(new Map([["a", 1]])))
    expectInvalid(() => canonicalJson(new Set([1])))
    class Thing {}
    expectInvalid(() => canonicalJson(new Thing()))
  })

  test("accepts a null-prototype object", () => {
    const value = Object.create(null) as Record<string, unknown>
    value.a = 1
    expect(canonicalJson(value)).toBe('{"a":1}')
  })

  test("rejects pathological nesting instead of overflowing the stack", () => {
    let deep: unknown = 1
    for (let i = 0; i < 5_000; i += 1) deep = [deep]
    expectInvalid(() => canonicalJson(deep))
  })
})
