// @vitest-environment node
import { describe, expect, test } from "vitest"
import { toDeviceView, toDeviceViews } from "../lib/device-view"

/** Mirrors `DeviceSummary` from the control plane: no userId, no credential. */
const VALID = {
  deviceId: "dev_1",
  displayName: "Studio",
  platform: "linux",
  status: "online",
  capabilities: ["blender:scene.render"],
  lastSeenAt: 1_700_000_000_000,
}

describe("toDeviceView", () => {
  test("maps a well-formed record", () => {
    expect(toDeviceView(VALID)).toEqual({
      deviceId: "dev_1",
      workspaceId: undefined,
      displayName: "Studio",
      platform: "linux",
      status: "online",
      capabilities: ["blender:scene.render"],
      lastSeenAt: 1_700_000_000_000,
    })
  })

  test("accepts `id` when the control plane keys the row that way", () => {
    const { deviceId: _deviceId, ...rest } = VALID
    expect(toDeviceView({ ...rest, id: "dev_9" })?.deviceId).toBe("dev_9")
  })

  test("falls back to the id for a missing display name", () => {
    const { displayName: _displayName, ...rest } = VALID
    expect(toDeviceView(rest)?.displayName).toBe("dev_1")
  })

  test("copies only known fields — a credential hash can never reach the DOM", () => {
    const view = toDeviceView({
      ...VALID,
      userId: "usr_1",
      credentialHash: "pbkdf2$sha256$210000$c2FsdA$aGFzaA",
      credentialVersion: 3,
      _id: "convex_row_1",
      payload: { authorization: "Bearer cgk_live_secret" },
    })

    expect(view).not.toBeNull()
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain("pbkdf2")
    expect(serialized).not.toContain("Bearer")
    expect(serialized).not.toContain("usr_1")
    expect(Object.keys(view ?? {}).sort()).toEqual([
      "capabilities",
      "deviceId",
      "displayName",
      "lastSeenAt",
      "platform",
      "status",
      "workspaceId",
    ])
  })

  test("drops non-string capabilities instead of rendering them", () => {
    expect(toDeviceView({ ...VALID, capabilities: ["a", 1, null, "", "b"] })?.capabilities).toEqual(["a", "b"])
    expect(toDeviceView({ ...VALID, capabilities: "blender:*" })?.capabilities).toEqual([])
  })

  test("an unreadable last-seen value is dropped, not rendered as NaN", () => {
    expect(toDeviceView({ ...VALID, lastSeenAt: "yesterday" })?.lastSeenAt).toBeUndefined()
    expect(toDeviceView({ ...VALID, lastSeenAt: Number.NaN })?.lastSeenAt).toBeUndefined()
  })

  describe("DENIED cases", () => {
    test.each<[string, unknown]>([
      ["not a record", "dev_1"],
      ["null", null],
      ["an array", [VALID]],
      ["a class instance", new Map()],
    ])("rejects %s", (_name, input) => {
      expect(toDeviceView(input)).toBeNull()
    })

    test.each<[string, unknown]>([
      ["no identity", { ...VALID, deviceId: undefined, id: undefined }],
      ["an empty identity", { ...VALID, deviceId: "" }],
      ["an unknown platform", { ...VALID, platform: "solaris" }],
      ["an unknown status", { ...VALID, status: "quarantined" }],
      ["a numeric status", { ...VALID, status: 1 }],
    ])("rejects a record with %s", (_name, input) => {
      expect(toDeviceView(input)).toBeNull()
    })
  })
})

describe("toDeviceViews", () => {
  test("keeps readable rows and drops the rest", () => {
    const views = toDeviceViews([VALID, { ...VALID, status: "gone" }, null, { ...VALID, deviceId: "dev_2" }])
    expect(views.map((view) => view.deviceId)).toEqual(["dev_1", "dev_2"])
  })

  test("returns an empty list for anything that is not an array", () => {
    expect(toDeviceViews(undefined)).toEqual([])
    expect(toDeviceViews({ page: [VALID] })).toEqual([])
  })
})
