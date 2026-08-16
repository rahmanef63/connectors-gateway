import { describe, expect, test } from "bun:test"
import type { CapabilityReport } from "@cg/core"
import type { AgentConfig } from "./config"
import { formatStatus } from "./status"

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

describe("formatStatus", () => {
  test("reports device id, connection state and adapters", () => {
    const text = formatStatus(config, reports, "online")
    expect(text).toContain("dev_abc123")
    expect(text).toContain("connection:  online")
    expect(text).toContain("  blender 4.2.1: available")
    expect(text).toContain("    - blender:scene.render")
    expect(text).toContain("    - blender:scene.inspect")
    expect(text).toContain("  ghost: unavailable")
    expect(text).toContain("disabled locally:\n  - blender.file.export")
  })

  test("NEVER contains the credential", () => {
    expect(formatStatus(config, reports, "online")).not.toContain(CREDENTIAL)
  })

  test("an unpaired machine reports no device and no gateway", () => {
    const text = formatStatus(null, [], "idle")
    expect(text).toContain("not paired")
    expect(text).toContain("gateway:     unset")
    expect(text).toContain("(none registered)")
  })

  test("the signing key is not printed either — status is not a key dump", () => {
    const text = formatStatus(config, reports, "online")
    expect(text).not.toContain(config.signingPublicKey)
    expect(text).toContain("dev_abc123")
    expect(text).toContain("blender:scene.render")
  })

  test("an idle connection explains itself instead of lying about being offline", () => {
    const text = formatStatus(config, reports, "idle")
    expect(text).toContain("not connected in this process")
  })
})
