import { describe, expect, test } from "bun:test"
import type { CapabilityReport } from "@cg/core"
import type { AgentConfig } from "./config"
import { buildStatus, formatStatus } from "./status"

const CREDENTIAL = "cgd_this_is_the_device_credential_do_not_print_me"

const config: AgentConfig = {
  deviceId: "dev_abc123",
  credential: CREDENTIAL,
  gatewayUrl: "wss://gateway.example.com/device",
  signingPublicKey: "MCowBQYDK2VwAyEAfake",
  keyId: "k1",
  disabledActions: ["blender.file.export"],
}

const reports: CapabilityReport[] = [
  { connector: "blender", status: "available", version: "4.2.1", adapterVersion: "0.1.0", capabilities: ["scene.render", "scene.inspect"] },
  { connector: "ghost", status: "unavailable", adapterVersion: "0.1.0", capabilities: [] },
]

describe("buildStatus", () => {
  test("reports device id, connection state and adapters", () => {
    const report = buildStatus({ config, reports, connection: "online" })
    expect(report.paired).toBe(true)
    expect(report.deviceId).toBe("dev_abc123")
    expect(report.connection).toBe("online")
    expect(report.adapters).toHaveLength(2)
    expect(report.adapters[0]?.capabilities).toEqual(["blender:scene.render", "blender:scene.inspect"])
    expect(report.disabledActions).toEqual(["blender.file.export"])
  })

  test("NEVER contains the credential — neither the object nor the printed text", () => {
    const report = buildStatus({ config, reports, connection: "online" })
    expect(JSON.stringify(report)).not.toContain(CREDENTIAL)
    expect(formatStatus(report)).not.toContain(CREDENTIAL)
    expect(Object.keys(report)).not.toContain("credential")
  })

  test("an unpaired machine reports no device and no gateway", () => {
    const report = buildStatus({ config: null, reports: [], connection: "idle" })
    expect(report.paired).toBe(false)
    expect(report.deviceId).toBeUndefined()
    expect(report.gatewayUrl).toBeUndefined()
    const text = formatStatus(report)
    expect(text).toContain("not paired")
    expect(text).toContain("(none registered)")
  })

  test("the signing key is not printed either — status is not a key dump", () => {
    const text = formatStatus(buildStatus({ config, reports, connection: "online" }))
    expect(text).not.toContain(config.signingPublicKey)
    expect(text).toContain("dev_abc123")
    expect(text).toContain("blender:scene.render")
  })

  test("an idle connection explains itself instead of lying about being offline", () => {
    const text = formatStatus(buildStatus({ config, reports, connection: "idle" }))
    expect(text).toContain("not connected in this process")
  })
})
