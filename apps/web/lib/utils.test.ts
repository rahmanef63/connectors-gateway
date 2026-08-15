import { describe, expect, test } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  test("joins plain class names", () => {
    expect(cn("a", "b")).toBe("a b")
  })

  test("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "")).toBe("a")
  })

  test("supports conditional objects and arrays", () => {
    expect(cn(["a", { b: true, c: false }])).toBe("a b")
  })

  test("later tailwind utility of the same group wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
    expect(cn("bg-background", "bg-card")).toBe("bg-card")
  })

  test("keeps utilities from different groups", () => {
    expect(cn("text-foreground", "bg-background")).toBe("text-foreground bg-background")
  })

  test("returns an empty string for no input", () => {
    expect(cn()).toBe("")
  })
})
