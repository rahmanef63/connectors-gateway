import { describe, expect, test } from "vitest"
import { timingSafeEqual } from "./constant-time"

describe("timingSafeEqual", () => {
  test("matches identical strings", () => {
    expect(timingSafeEqual("", "")).toBe(true)
    expect(timingSafeEqual("token", "token")).toBe(true)
    expect(timingSafeEqual("ünïcødé-Ω", "ünïcødé-Ω")).toBe(true)
  })

  test("rejects any difference, including length and prefix", () => {
    expect(timingSafeEqual("token", "tokes")).toBe(false)
    expect(timingSafeEqual("token", "token ")).toBe(false)
    expect(timingSafeEqual("token", "toke")).toBe(false)
    expect(timingSafeEqual("token", "")).toBe(false)
    expect(timingSafeEqual("", "token")).toBe(false)
    expect(timingSafeEqual("Token", "token")).toBe(false)
  })

  test("compares bytes, so different code points of equal length differ", () => {
    expect(timingSafeEqual("é", "e")).toBe(false)
  })
})
