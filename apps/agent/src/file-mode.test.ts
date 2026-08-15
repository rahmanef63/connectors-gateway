import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GatewayError } from "@cg/core"
import {
  assertPrivateMode,
  assertPrivatePath,
  isGroupOrWorldAccessible,
  supportsPosixModes,
} from "./file-mode"

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempFile(mode: number): string {
  const dir = mkdtempSync(join(tmpdir(), "cg-agent-mode-"))
  dirs.push(dir)
  const file = join(dir, "config.json")
  writeFileSync(file, "{}", { mode: 0o600 })
  chmodSync(file, mode)
  return file
}

describe("isGroupOrWorldAccessible", () => {
  test("0600 and 0700 are private; anything with group/other bits is not", () => {
    expect(isGroupOrWorldAccessible(0o600)).toBe(false)
    expect(isGroupOrWorldAccessible(0o700)).toBe(false)
    expect(isGroupOrWorldAccessible(0o640)).toBe(true)
    expect(isGroupOrWorldAccessible(0o604)).toBe(true)
    expect(isGroupOrWorldAccessible(0o666)).toBe(true)
    expect(isGroupOrWorldAccessible(0o100600)).toBe(false) // real st_mode with file type bits
  })
})

describe("assertPrivateMode", () => {
  test("DENIED: a world-readable mode throws NOT_AUTHORIZED", () => {
    let thrown: unknown
    try {
      assertPrivateMode(0o644, "credential store", "linux")
    } catch (cause) {
      thrown = cause
    }
    expect((thrown as GatewayError).code).toBe("NOT_AUTHORIZED")
    expect((thrown as GatewayError).message).toContain("chmod")
    // The hint uses the env var, never a real path (AGENTS.md P0).
    expect((thrown as GatewayError).message).toContain("$CG_CONFIG_DIR")
  })

  test("passes for an owner-only mode", () => {
    expect(() => assertPrivateMode(0o600, "credential store", "linux")).not.toThrow()
  })

  test("windows has no POSIX modes, so the check is skipped rather than failing everyone", () => {
    expect(supportsPosixModes("win32")).toBe(false)
    expect(() => assertPrivateMode(0o666, "credential store", "win32")).not.toThrow()
  })
})

describe("assertPrivatePath", () => {
  test("reads the real mode off disk", () => {
    if (!supportsPosixModes()) return
    expect(() => assertPrivatePath(tempFile(0o600), "credential store")).not.toThrow()
    expect(() => assertPrivatePath(tempFile(0o644), "credential store")).toThrow(GatewayError)
  })

  test("a missing file is INTERNAL, and the path is not echoed", () => {
    if (!supportsPosixModes()) return
    const missing = join(tmpdir(), "cg-agent-does-not-exist-92831", "config.json")
    try {
      assertPrivatePath(missing, "credential store")
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("INTERNAL")
      expect((cause as GatewayError).message).not.toContain(missing)
    }
  })
})
