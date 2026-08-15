import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { AGENT_VERSION, defaultDeviceName, detectPlatform, isDevicePlatform, stripControlChars } from "./identity"

describe("detectPlatform", () => {
  test("maps the three supported runtimes", () => {
    expect(detectPlatform("win32")).toBe("windows")
    expect(detectPlatform("darwin")).toBe("macos")
    expect(detectPlatform("linux")).toBe("linux")
  })

  test("DENIED: an unsupported platform has no device record shape", () => {
    expect(() => detectPlatform("freebsd")).toThrow(GatewayError)
  })

  test("the detected platform is always a valid DevicePlatform", () => {
    expect(isDevicePlatform(detectPlatform())).toBe(true)
    expect(isDevicePlatform("solaris")).toBe(false)
  })
})

describe("defaultDeviceName", () => {
  test("keeps a normal hostname", () => {
    expect(defaultDeviceName("rahman-workstation")).toBe("rahman-workstation")
    expect(defaultDeviceName("MacBook Pro (work)")).toBe("MacBook Pro (work)")
  })

  test("strips control characters and anything outside the gateway's charset", () => {
    const hostile = `evil${String.fromCharCode(27)}[2Jhost:8080`
    const name = defaultDeviceName(hostile)
    expect(name).toBe("evil2Jhost8080")
    expect(name).not.toContain(":")
  })

  test("falls back when nothing usable is left", () => {
    expect(defaultDeviceName("###")).toBe("connectors-agent")
    expect(defaultDeviceName("   ")).toBe("connectors-agent")
  })

  test("is capped at 64 characters (the gateway rejects longer)", () => {
    expect(defaultDeviceName("h".repeat(200)).length).toBe(64)
  })
})

describe("stripControlChars", () => {
  test("removes control characters, keeps printable text", () => {
    expect(stripControlChars(`a${String.fromCharCode(0)}b${String.fromCharCode(127)}c`)).toBe("abc")
    expect(stripControlChars("plain text")).toBe("plain text")
  })
})

describe("AGENT_VERSION", () => {
  test("is a semver-looking string announced in hello", () => {
    expect(AGENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
