import { describe, expect, test } from "bun:test"
import { basename, looksLikeAbsolutePath, stripPaths } from "./paths"

describe("basename", () => {
  test("returns the last non-empty segment of either style", () => {
    expect(basename("/home/u/renders/frame.png")).toBe("frame.png")
    expect(basename("/home/u/renders/")).toBe("renders")
    expect(basename("C:\\Users\\u\\out.png")).toBe("out.png")
  })

  test("never returns an empty string", () => {
    expect(basename("/")).toBe("/")
    expect(basename("")).toBe("")
  })
})

describe("looksLikeAbsolutePath", () => {
  test("detects both path styles and nothing else", () => {
    expect(looksLikeAbsolutePath("/home/u/a.txt")).toBe(true)
    expect(looksLikeAbsolutePath("C:\\tmp\\a.txt")).toBe(true)
    expect(looksLikeAbsolutePath("frame.png")).toBe(false)
    expect(looksLikeAbsolutePath("https://cdn.example.com/a/b.png")).toBe(false)
  })
})

describe("stripPaths", () => {
  test("rewrites every occurrence in a sentence", () => {
    expect(stripPaths("copied /a/b/c.txt to /d/e/f.txt")).toBe("copied c.txt to f.txt")
  })
})
