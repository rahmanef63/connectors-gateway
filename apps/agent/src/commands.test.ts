import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CapabilityReport } from "@cg/core"
import { createAdapterRegistry } from "./adapters"
import { revokeLocalCommand, statusCommand } from "./commands"
import { saveConfig, tryLoadConfig } from "./config"
import type { AgentConfig } from "./config"

const CREDENTIAL = "cgd_credential_that_must_never_be_printed"
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cg-agent-cmd-"))
  dirs.push(dir)
  return dir
}

function config(): AgentConfig {
  return {
    deviceId: "dev_cli",
    credential: CREDENTIAL,
    gatewayUrl: "wss://gateway.example.com/device",
    signingPublicKey: "MCowBQYDK2VwAyEAfake",
    keyId: "k1",
    disabledActions: [],
  }
}

const report: CapabilityReport = {
  connector: "blender",
  status: "available",
  adapterVersion: "0.1.0",
  capabilities: ["scene.render"],
}

function registry() {
  return createAdapterRegistry([
    {
      manifest: { id: "blender", name: "Blender", version: "0.1.0", executor: "local", auth: { type: "device" }, actions: [] },
      detect: async () => report,
      execute: async () => ({ output: null }),
    },
  ])
}

describe("statusCommand", () => {
  test("prints the device id and adapters, and NEVER the credential", async () => {
    const dir = tempDir()
    saveConfig(dir, config())
    const printed: string[] = []
    const text = await statusCommand({
      env: { CG_CONFIG_DIR: dir },
      print: (line) => void printed.push(line),
      registry: registry(),
    })
    expect(text).toContain("dev_cli")
    expect(text).toContain("blender:scene.render")
    expect(text).not.toContain(CREDENTIAL)
    expect(printed.join("\n")).not.toContain(CREDENTIAL)
  })

  test("works on an unpaired machine", async () => {
    const text = await statusCommand({
      env: { CG_CONFIG_DIR: tempDir() },
      print: () => {},
      registry: registry(),
    })
    expect(text).toContain("not paired")
  })
})

describe("revokeLocalCommand", () => {
  test("deletes the local credential file and says what it did NOT do", () => {
    const dir = tempDir()
    saveConfig(dir, config())
    const text = revokeLocalCommand({ env: { CG_CONFIG_DIR: dir }, print: () => {} })
    expect(tryLoadConfig(dir)).toBeNull()
    expect(text).toContain("deleted")
    // Local deletion is not remote revocation (docs/04).
    expect(text).toContain("dashboard")
    expect(text).not.toContain(CREDENTIAL)
  })

  test("is a no-op when nothing was stored", () => {
    const text = revokeLocalCommand({ env: { CG_CONFIG_DIR: tempDir() }, print: () => {} })
    expect(text).toContain("No local device credential")
  })
})
