import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { resolveExportPath, toRelativeExportName, toSafeOutput } from "./paths"

const ROOT = "/var/tmp/cg-blender-exports"

function reason(fn: () => unknown): GatewayError {
  try {
    fn()
  } catch (error) {
    if (error instanceof GatewayError) return error
    throw error
  }
  throw new Error("expected a GatewayError")
}

describe("resolveExportPath", () => {
  test("accepts a plain relative name inside the root", () => {
    expect(resolveExportPath(ROOT, "shot.glb")).toBe(`${ROOT}/shot.glb`)
  })

  test("accepts a nested relative name", () => {
    expect(resolveExportPath(ROOT, "renders/shot.glb")).toBe(`${ROOT}/renders/shot.glb`)
  })

  test("rejects parent traversal", () => {
    expect(reason(() => resolveExportPath(ROOT, "../../etc/passwd")).code).toBe("INVALID_INPUT")
  })

  test("rejects traversal hidden mid-path", () => {
    expect(reason(() => resolveExportPath(ROOT, "renders/../../../etc/passwd")).code).toBe("INVALID_INPUT")
  })

  test("rejects a POSIX absolute path", () => {
    expect(reason(() => resolveExportPath(ROOT, "/etc/passwd")).code).toBe("INVALID_INPUT")
  })

  test("rejects a Windows absolute path and a UNC path", () => {
    expect(reason(() => resolveExportPath(ROOT, "C:\\Windows\\system32\\config")).code).toBe("INVALID_INPUT")
    expect(reason(() => resolveExportPath(ROOT, "\\\\fileserver\\share\\x.glb")).code).toBe("INVALID_INPUT")
  })

  test("rejects a null byte", () => {
    expect(reason(() => resolveExportPath(ROOT, "shot.glb\u0000.png")).code).toBe("INVALID_INPUT")
  })

  test("rejects home expansion, empty names and over-long names", () => {
    expect(reason(() => resolveExportPath(ROOT, "~/shot.glb")).code).toBe("INVALID_INPUT")
    expect(reason(() => resolveExportPath(ROOT, "")).code).toBe("INVALID_INPUT")
    expect(reason(() => resolveExportPath(ROOT, "a".repeat(500))).code).toBe("INVALID_INPUT")
  })

  test("never echoes the rejected value in the error message", () => {
    expect(reason(() => resolveExportPath(ROOT, "../../etc/passwd")).message).not.toContain("etc/passwd")
  })
})

describe("toRelativeExportName", () => {
  test("returns a POSIX relative name", () => {
    expect(toRelativeExportName(ROOT, "renders/shot.glb")).toBe("renders/shot.glb")
  })

  test("still rejects traversal", () => {
    expect(reason(() => toRelativeExportName(ROOT, "../escape.glb")).code).toBe("INVALID_INPUT")
  })
})

describe("toSafeOutput", () => {
  test("strips a POSIX absolute path", () => {
    expect(toSafeOutput("/home/artist/secret-project/render.png")).toBe("render.png")
  })

  test("strips a Windows absolute path", () => {
    expect(toSafeOutput("C:\\Users\\artist\\Documents\\render.png")).toBe("render.png")
  })

  test("leaves a bare base name alone", () => {
    expect(toSafeOutput("render.png")).toBe("render.png")
  })

  test("falls back when nothing usable is left", () => {
    expect(toSafeOutput("/")).toBe("output")
    expect(toSafeOutput("../..")).toBe("output")
  })
})
