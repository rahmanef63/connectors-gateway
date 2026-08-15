import { describe, expect, test } from "bun:test"
import { basename, sanitizeFile, stripPaths } from "./sanitize"

describe("basename", () => {
  test("handles both path styles and trailing separators", () => {
    expect(basename("/home/u/renders/frame.png")).toBe("frame.png")
    expect(basename("C:\\Users\\u\\out.png")).toBe("out.png")
    expect(basename("/home/u/renders/")).toBe("renders")
    expect(basename("frame.png")).toBe("frame.png")
  })
})

describe("stripPaths", () => {
  test("rewrites absolute paths but leaves URLs and ids alone", () => {
    expect(stripPaths("saved to /home/u/a.blend and C:\\tmp\\b.png")).toBe(
      "saved to a.blend and b.png",
    )
    expect(stripPaths("https://api.example.com/v1/files/1")).toBe("https://api.example.com/v1/files/1")
    expect(stripPaths("file_abc123")).toBe("file_abc123")
  })
})

describe("sanitizeFile", () => {
  test("keeps only the declared fields and strips local paths", () => {
    const sanitized = sanitizeFile({
      name: "/home/user/renders/frame.png",
      mimeType: "image/png",
      sizeBytes: 10,
      ref: "/home/user/renders/frame.png",
      expiresAt: 5,
    })

    expect(sanitized).toEqual({
      name: "frame.png",
      mimeType: "image/png",
      sizeBytes: 10,
      ref: "frame.png",
      expiresAt: 5,
    })
  })

  test("omits expiresAt when absent", () => {
    const sanitized = sanitizeFile({ name: "a.png", mimeType: "image/png", sizeBytes: 1, ref: "r" })
    expect("expiresAt" in sanitized).toBe(false)
  })
})
