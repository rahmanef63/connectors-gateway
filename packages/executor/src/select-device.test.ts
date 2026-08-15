import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { namespaceCapabilities, selectDevice } from "./select-device"
import { makeDevice } from "./__tests__/fixtures"

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (cause) {
    return cause instanceof GatewayError ? cause.code : "NOT_A_GATEWAY_ERROR"
  }
  return "NO_THROW"
}

describe("namespaceCapabilities", () => {
  test("prefixes bare capabilities and leaves qualified ones alone", () => {
    expect(namespaceCapabilities("blender", ["scene.render", "blender:scene.info"])).toEqual([
      "blender:scene.render",
      "blender:scene.info",
    ])
  })
})

describe("selectDevice", () => {
  const capable = makeDevice({ id: "dev_ok", capabilities: ["blender:scene.render"] })

  test("picks an online device that announces every required capability", () => {
    const selection = selectDevice({
      devices: [makeDevice({ id: "dev_offline", status: "offline" }), capable],
      connectorId: "blender",
      requiredCapabilities: ["scene.render"],
    })
    expect(selection.device.id).toBe("dev_ok")
    expect(selection.required).toEqual(["blender:scene.render"])
  })

  test("an action with no requirements accepts any online device", () => {
    const selection = selectDevice({
      devices: [makeDevice({ id: "dev_bare", capabilities: [] })],
      connectorId: "blender",
    })
    expect(selection.device.id).toBe("dev_bare")
  })

  test("DENIED: every device offline -> DEVICE_OFFLINE", () => {
    expect(
      codeOf(() =>
        selectDevice({
          devices: [makeDevice({ status: "offline", capabilities: ["blender:scene.render"] })],
          connectorId: "blender",
          requiredCapabilities: ["scene.render"],
        }),
      ),
    ).toBe("DEVICE_OFFLINE")
  })

  test("DENIED: online but missing one of several capabilities -> CAPABILITY_UNAVAILABLE", () => {
    expect(
      codeOf(() =>
        selectDevice({
          devices: [capable],
          connectorId: "blender",
          requiredCapabilities: ["scene.render", "scene.export"],
        }),
      ),
    ).toBe("CAPABILITY_UNAVAILABLE")
  })

  test("DENIED: a pinned device that is not in the pool -> DEVICE_OFFLINE", () => {
    expect(
      codeOf(() =>
        selectDevice({ devices: [capable], connectorId: "blender", deviceId: "dev_missing" }),
      ),
    ).toBe("DEVICE_OFFLINE")
  })

  test("DENIED: only revoked devices -> DEVICE_REVOKED", () => {
    expect(
      codeOf(() =>
        selectDevice({
          devices: [makeDevice({ status: "revoked", capabilities: ["blender:scene.render"] })],
          connectorId: "blender",
          requiredCapabilities: ["scene.render"],
        }),
      ),
    ).toBe("DEVICE_REVOKED")
  })
})
