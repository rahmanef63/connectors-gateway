// @vitest-environment node
import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8")

describe("device CRUD presentation contract", () => {
  test("binds the slice to create/read/update/delete lifecycle without arbitrary browser-side create", () => {
    const functions = read("../config/functions.ts")
    expect(functions).toContain("listMine:")
    expect(functions).toContain("rename:")
    expect(functions).toContain("revoke:")
    expect(functions).toContain("forget:")
    expect(functions).not.toMatch(/create\s*:/)
    expect(functions).not.toMatch(/pairing.*claim/i)
  })

  test("shows permanent forget only after the device is already revoked", () => {
    const card = read("../components/device-card.tsx")
    expect(card).toContain('const revoked = device.status === "revoked"')
    expect(card).toContain("{revoked ? <ForgetDeviceDialog")
    expect(card).toContain("disabled={revoked}")
  })

  test("the permanent-delete dialog never combines revoke and forget into one call", () => {
    const dialog = read("../components/forget-device-dialog.tsx")
    const hook = read("../hooks/use-forget-device.ts")
    expect(dialog).toContain("forgetDevice(device.deviceId)")
    expect(dialog).not.toContain("revokeDevice")
    expect(hook).toContain("devicesFunctions.forget")
    expect(hook).not.toContain("devicesFunctions.revoke")
  })
})
