import { describe, expect, test } from "bun:test"
import { sanitizeFile } from "./sanitize"

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
