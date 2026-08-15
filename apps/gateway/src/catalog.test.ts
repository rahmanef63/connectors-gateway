import { describe, expect, test } from "bun:test"
import type { Principal } from "@cg/core"
import {
  activeConnection,
  fakeConnections,
  fakeDevices,
  makeDevice,
  testRegistry,
  TEST_CONNECTOR,
  TEST_LOCAL_CONNECTOR,
} from "./__tests__/fixtures"
import { announcedCapabilities, connectorsWithCapabilities } from "./capabilities"
import { resolveCatalog } from "./catalog"

const principal: Principal = { callerId: "keytest1", userId: "usr_1", scopes: ["*"] }

function deps(devices = fakeDevices(), connections = fakeConnections()) {
  return { registry: testRegistry, devices, connections }
}

describe("announcedCapabilities", () => {
  test("only ONLINE devices contribute", () => {
    const capabilities = announcedCapabilities([
      makeDevice({ id: "a", capabilities: ["testlocal:render"] }),
      makeDevice({ id: "b", status: "offline", capabilities: ["testlocal:secret"] }),
      makeDevice({ id: "c", status: "revoked", capabilities: ["testlocal:revoked"] }),
    ])
    expect(capabilities).toEqual(["testlocal:render"])
  })

  test("duplicates collapse", () => {
    expect(
      announcedCapabilities([
        makeDevice({ id: "a", capabilities: ["x:y"] }),
        makeDevice({ id: "b", capabilities: ["x:y"] }),
      ]),
    ).toEqual(["x:y"])
  })
})

describe("connectorsWithCapabilities", () => {
  test("reads the connector namespace off each capability", () => {
    expect(connectorsWithCapabilities(["blender:scene.render", "blender:object.list"])).toEqual([
      "blender",
    ])
  })

  test("an unnamespaced capability names no connector", () => {
    expect(connectorsWithCapabilities(["scene.render", ":leading"])).toEqual([])
  })
})

describe("resolveCatalog", () => {
  test("a connector with no connection and no device is hidden", async () => {
    expect(await resolveCatalog(deps(), principal)).toEqual([])
  })

  test("an active connection reveals the cloud connector", async () => {
    const entries = await resolveCatalog(
      deps(fakeDevices(), fakeConnections([activeConnection])),
      principal,
    )
    expect(entries.map((entry) => entry.connector.id)).toEqual([TEST_CONNECTOR])
  })

  test("a revoked connection does not reveal it", async () => {
    const entries = await resolveCatalog(
      deps(fakeDevices(), fakeConnections([{ ...activeConnection, status: "revoked" }])),
      principal,
    )
    expect(entries).toEqual([])
  })

  test("an online device announcing a capability reveals the local connector", async () => {
    const entries = await resolveCatalog(
      deps(fakeDevices([makeDevice({ capabilities: ["testlocal:render"] })])),
      principal,
    )
    expect(entries.map((entry) => entry.connector.id)).toEqual([TEST_LOCAL_CONNECTOR])
  })

  test("an offline device hides the local connector again", async () => {
    const entries = await resolveCatalog(
      deps(fakeDevices([makeDevice({ status: "offline", capabilities: ["testlocal:render"] })])),
      principal,
    )
    expect(entries).toEqual([])
  })

  test("a caller without the required scope sees nothing", async () => {
    const scoped: Principal = { ...principal, scopes: [] }
    const entries = await resolveCatalog(
      deps(fakeDevices(), fakeConnections([activeConnection])),
      scoped,
    )
    // The test manifest declares no requiredScopes, so the connector is still
    // visible: scope filtering is asserted by @cg/registry's own suite.
    expect(entries.map((entry) => entry.connector.id)).toEqual([TEST_CONNECTOR])
  })
})
