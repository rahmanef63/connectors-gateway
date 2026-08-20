import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GatewayError } from "@cg/core"
import {
  configPathIn,
  deleteConfig,
  loadConfig,
  parseConfig,
  resolveConfigDir,
  saveConfig,
  tryLoadConfig,
} from "./config"
import { isGroupOrWorldAccessible, supportsPosixModes } from "./file-mode"
import type { AgentConfig } from "./config"

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cg-agent-config-"))
  dirs.push(dir)
  return dir
}

const CREDENTIAL = "cgd_super_secret_device_credential"

function config(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    deviceId: "dev_1234",
    credential: CREDENTIAL,
    gatewayUrl: "wss://gateway.example.com/device",
    signingPublicKey: "MCowBQYDK2VwAyEAfakefakefakefakefakefakefakefakefake",
    keyId: "k1",
    disabledActions: [],
    ...overrides,
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("resolveConfigDir", () => {
  test("CG_CONFIG_DIR wins, otherwise ~/.connectors-agent", () => {
    expect(resolveConfigDir({ CG_CONFIG_DIR: "/opt/agent " })).toBe("/opt/agent")
    expect(resolveConfigDir({ CG_CONFIG_DIR: "   " })).toContain(".connectors-agent")
    expect(resolveConfigDir({})).toContain(".connectors-agent")
  })
})

describe("saveConfig / loadConfig", () => {
  test("writes 0600 inside a 0700 directory and round-trips", () => {
    const dir = tempDir()
    saveConfig(dir, config())
    expect(loadConfig(dir)).toEqual(config())
    if (supportsPosixModes()) {
      expect(statSync(configPathIn(dir)).mode & 0o777).toBe(0o600)
      expect(statSync(dir).mode & 0o777).toBe(0o700)
    }
  })

  test("re-saving over a permissive existing file tightens it back to 0600", () => {
    const dir = tempDir()
    saveConfig(dir, config())
    if (!supportsPosixModes()) return
    chmodSync(configPathIn(dir), 0o644)
    saveConfig(dir, config({ keyId: "k2" }))
    expect(isGroupOrWorldAccessible(statSync(configPathIn(dir)).mode)).toBe(false)
  })

  test("DENIED: refuses to load a world-readable credential store", () => {
    const dir = tempDir()
    saveConfig(dir, config())
    if (!supportsPosixModes()) return
    chmodSync(configPathIn(dir), 0o644)

    let thrown: unknown
    try {
      loadConfig(dir)
    } catch (cause) {
      thrown = cause
    }
    expect(thrown).toBeInstanceOf(GatewayError)
    expect((thrown as GatewayError).code).toBe("NOT_AUTHORIZED")
    // The advice must not leak the real path (AGENTS.md P0).
    expect((thrown as GatewayError).message).not.toContain(dir)
    expect((thrown as GatewayError).message).toContain("chmod 600")
  })

  test("DENIED: refuses a group-readable credential store", () => {
    const dir = tempDir()
    saveConfig(dir, config())
    if (!supportsPosixModes()) return
    chmodSync(configPathIn(dir), 0o640)
    expect(() => loadConfig(dir)).toThrow(GatewayError)
  })

  test("an unpaired directory is NOT_AUTHENTICATED, and tryLoadConfig is null", () => {
    const dir = tempDir()
    expect(tryLoadConfig(dir)).toBeNull()
    expect(() => loadConfig(dir)).toThrow(GatewayError)
    try {
      loadConfig(dir)
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("NOT_AUTHENTICATED")
    }
  })

  test("DENIED: a hand-edited, corrupt store is rejected without echoing its body", () => {
    const dir = tempDir()
    saveConfig(dir, config())
    writeFileSync(configPathIn(dir), `{"credential": "${CREDENTIAL}"`, { mode: 0o600 })
    try {
      loadConfig(dir)
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("INVALID_INPUT")
      expect((cause as GatewayError).message).not.toContain(CREDENTIAL)
    }
  })
})

describe("parseConfig", () => {
  test("rejects every missing or malformed field without echoing the value", () => {
    expect(() => parseConfig(null)).toThrow(GatewayError)
    expect(() => parseConfig([])).toThrow(GatewayError)
    expect(() => parseConfig(config({ deviceId: "" }))).toThrow(GatewayError)
    expect(() => parseConfig({ ...config(), credential: 42 })).toThrow(GatewayError)
    expect(() => parseConfig(config({ credential: "bad\ncredential" }))).toThrow(GatewayError)
    expect(() => parseConfig({ ...config(), disabledActions: "all" })).toThrow(GatewayError)
  })

  test("DENIED: an http gateway url — the session is outbound WebSocket only", () => {
    expect(() => parseConfig(config({ gatewayUrl: "https://gateway.example.com/device" }))).toThrow(GatewayError)
    expect(() => parseConfig(config({ gatewayUrl: "notaurl" }))).toThrow(GatewayError)
    expect(parseConfig(config({ gatewayUrl: "ws://localhost:8787/device" })).gatewayUrl).toBe(
      "ws://localhost:8787/device",
    )
  })

  test("the pinned signing key is optional, but never half-present", () => {
    const { signingPublicKey, keyId, ...unpinned } = config()
    void signingPublicKey
    void keyId
    expect(parseConfig(unpinned).signingPublicKey).toBeUndefined()
    expect(() => parseConfig({ ...unpinned, keyId: "k1" })).toThrow(GatewayError)
    expect(() => parseConfig({ ...unpinned, signingPublicKey: "MCowBQ" })).toThrow(GatewayError)
  })

  test("a missing disabledActions defaults to empty", () => {
    const { disabledActions, ...rest } = config()
    void disabledActions
    expect(parseConfig(rest).disabledActions).toEqual([])
  })

  test("the error message never contains the credential", () => {
    try {
      parseConfig({ ...config(), keyId: 7 })
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).message).not.toContain(CREDENTIAL)
    }
  })
})

describe("deleteConfig", () => {
  test("removes the credential file once", () => {
    const dir = tempDir()
    saveConfig(dir, config())
    expect(deleteConfig(dir)).toBe(true)
    expect(deleteConfig(dir)).toBe(false)
    expect(tryLoadConfig(dir)).toBeNull()
  })
})

describe("native credential migration", () => {
  const native = () => {
    const values = new Map<string, string>()
    return {
      kind: "linux-secret-service" as const,
      values,
      read: (deviceId: string) => values.get(deviceId) ?? null,
      write: (deviceId: string, credential: string) => { values.set(deviceId, credential) },
      delete: (deviceId: string) => values.delete(deviceId),
    }
  }

  test("moves plaintext out of config only after native persistence succeeds", () => {
    const dir = tempDir()
    const store = native()
    saveConfig(dir, config(), store)
    const raw = readFileSync(configPathIn(dir), "utf8")
    expect(raw).not.toContain(CREDENTIAL)
    expect(raw).toContain("os:connectors-agent:v1")
    expect(loadConfig(dir, store)).toEqual(config())
  })

  test("an OS reference fails closed when its native store is unavailable", () => {
    const dir = tempDir()
    const store = native()
    saveConfig(dir, config(), store)
    expect(() => loadConfig(dir, null)).toThrow(GatewayError)
  })

  test("failed native persistence never writes a reference that would lose the credential", () => {
    const dir = tempDir()
    const broken = { ...native(), write: () => { throw new GatewayError("INTERNAL", "native unavailable") } }
    expect(() => saveConfig(dir, config(), broken)).toThrow(GatewayError)
    expect(tryLoadConfig(dir, null)).toBeNull()
  })

  test("revoke-local removes the native entry before the metadata file", () => {
    const dir = tempDir()
    const store = native()
    saveConfig(dir, config(), store)
    expect(store.values.has(config().deviceId)).toBe(true)
    expect(deleteConfig(dir, store)).toBe(true)
    expect(store.values.has(config().deviceId)).toBe(false)
    expect(tryLoadConfig(dir, null)).toBeNull()
  })
})
