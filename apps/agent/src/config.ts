/**
 * The device credential store.
 *
 * This file holds the one secret the agent owns: the device credential issued at
 * pairing. docs/03 asks for "OS secure storage where possible".
 * ponytail: file perms now (dir 0700, file 0600, verified after every write);
 * OS keychain (macOS Keychain / DPAPI / libsecret) when a second platform needs it.
 */
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { GatewayError } from "@cg/core"
import { CREDENTIAL_REF, createNativeCredentialStore } from "./credential-store"
import type { NativeCredentialStore } from "./credential-store"
import { DIR_MODE, FILE_MODE, assertPrivatePath, supportsPosixModes } from "./file-mode"

export const CONFIG_FILE_NAME = "config.json"
export const DEFAULT_CONFIG_DIR_NAME = ".connectors-agent"

const MAX_FIELD_LENGTH = 512
const MAX_DISABLED_ACTIONS = 256
const CREDENTIAL_STORE = "credential store"

export type AgentConfig = {
  deviceId: string
  /** Secret. Never printed, never logged, never sent anywhere but the relay. */
  credential: string
  gatewayUrl: string
  /**
   * base64 SPKI Ed25519 key the gateway signs job envelopes with, pinned here.
   * Absent until it is learned: the reference gateway delivers it in `welcome`
   * rather than at claim time, so the first connection pins it (key-store.ts).
   */
  signingPublicKey?: string
  keyId?: string
  /** Action ids the user switched off locally. Most restrictive wins (docs/09). */
  disabledActions: string[]
}

export function resolveConfigDir(env: Record<string, string | undefined> = process.env): string {
  const override = env["CG_CONFIG_DIR"]
  if (typeof override === "string" && override.trim().length > 0) return override.trim()
  return join(homedir(), DEFAULT_CONFIG_DIR_NAME)
}

export function configPathIn(dir: string): string {
  return join(dir, CONFIG_FILE_NAME)
}

export function saveConfig(dir: string, config: AgentConfig, native: NativeCredentialStore | null = createNativeCredentialStore()): AgentConfig {
  const parsed = parseConfig(config)
  let stored = parsed
  if (native !== null) {
    // Commit native storage first. Only after it succeeds may the plaintext leave
    // the file; a failed migration therefore keeps the previous safe fallback.
    native.write(parsed.deviceId, parsed.credential)
    stored = { ...parsed, credential: CREDENTIAL_REF }
  }
  const file = configPathIn(dir)
  try {
    mkdirSync(dir, { recursive: true, mode: DIR_MODE })
    // mkdir's mode is masked by umask and a pre-existing dir keeps its own mode.
    if (supportsPosixModes()) chmodSync(dir, DIR_MODE)
    writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`, { mode: FILE_MODE })
    // writeFile's mode only applies at creation; an existing file keeps its mode.
    if (supportsPosixModes()) chmodSync(file, FILE_MODE)
  } catch (cause) {
    if (cause instanceof GatewayError) throw cause
    throw new GatewayError("INTERNAL", `The agent ${CREDENTIAL_STORE} could not be written.`)
  }
  // Verify AFTER writing: a hostile umask or a pre-existing symlink must not win.
  assertPrivatePath(file, CREDENTIAL_STORE)
  return parsed
}

/** Throws NOT_AUTHENTICATED when the device is not paired yet. */
export function loadConfig(dir: string, native: NativeCredentialStore | null = createNativeCredentialStore()): AgentConfig {
  const config = tryLoadConfig(dir, native)
  if (config === null) {
    throw new GatewayError("NOT_AUTHENTICATED", "This device is not paired. Run `agent pair` first.")
  }
  return config
}

/** null only when the file is absent. A permissive or corrupt file still throws. */
export function tryLoadConfig(dir: string, native: NativeCredentialStore | null = createNativeCredentialStore()): AgentConfig | null {
  const file = configPathIn(dir)
  if (!existsAsFile(file)) return null
  assertPrivatePath(file, CREDENTIAL_STORE)

  const config = readStoredConfig(file)
  if (config.credential !== CREDENTIAL_REF) return config
  if (native === null) throw new GatewayError("NOT_AUTHENTICATED", "The OS credential store required by this device is unavailable.")
  const credential = native.read(config.deviceId)
  if (credential === null) throw new GatewayError("NOT_AUTHENTICATED", "The device credential is missing from the OS credential store.")
  return { ...config, credential }
}

/** `revoke-local`: forget the credential on this machine. Returns false if absent. */
export function deleteConfig(dir: string, native: NativeCredentialStore | null = createNativeCredentialStore()): boolean {
  const file = configPathIn(dir)
  if (!existsAsFile(file)) return false
  // Parse the private metadata file without resolving its credential reference:
  // revoke-local must still be able to delete a missing/corrupt vault entry.
  const metadata = readStoredConfig(file)
  try {
    if (metadata.credential === CREDENTIAL_REF && native === null) {
      throw new GatewayError("NOT_AUTHENTICATED", "The OS credential store required by this device is unavailable.")
    }
    native?.delete(metadata.deviceId)
    rmSync(file, { force: true })
  } catch {
    throw new GatewayError("INTERNAL", `The agent ${CREDENTIAL_STORE} could not be removed.`)
  }
  return true
}


function readStoredConfig(file: string): AgentConfig {
  let raw: string
  try {
    raw = readFileSync(file, "utf8")
  } catch {
    throw new GatewayError("INTERNAL", `The agent ${CREDENTIAL_STORE} could not be read.`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new GatewayError("INVALID_INPUT", `The agent ${CREDENTIAL_STORE} is not valid JSON.`)
  }
  return parseConfig(parsed)
}

/** The file is a trust boundary too — it can be hand-edited (AGENTS.md P0). */
export function parseConfig(value: unknown): AgentConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidConfig("must be a JSON object")
  }
  const record = value as Record<string, unknown>
  const config: AgentConfig = {
    deviceId: requireText(record["deviceId"], "deviceId"),
    credential: requireText(record["credential"], "credential"),
    gatewayUrl: requireGatewayUrl(record["gatewayUrl"]),
    disabledActions: parseDisabledActions(record["disabledActions"]),
  }
  // A half-pinned key would silently disable verification: both or neither.
  const signingPublicKey = record["signingPublicKey"]
  const keyId = record["keyId"]
  if (signingPublicKey !== undefined || keyId !== undefined) {
    config.signingPublicKey = requireText(signingPublicKey, "signingPublicKey")
    config.keyId = requireText(keyId, "keyId")
  }
  return config
}

/** The relay endpoint. Outbound WebSocket only — never an http(s) origin. */
export function requireGatewayUrl(value: unknown): string {
  const text = requireText(value, "gatewayUrl")
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw invalidConfig("gatewayUrl is not a URL")
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw invalidConfig("gatewayUrl must be a ws:// or wss:// URL")
  }
  return url.toString()
}

function parseDisabledActions(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw invalidConfig("disabledActions must be an array")
  if (value.length > MAX_DISABLED_ACTIONS) throw invalidConfig("disabledActions has too many entries")
  return value.map((entry) => requireText(entry, "disabledActions entry"))
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string") throw invalidConfig(`${field} must be a string`)
  const text = value.trim()
  if (text.length === 0) throw invalidConfig(`${field} must not be empty`)
  if (text.length > MAX_FIELD_LENGTH) throw invalidConfig(`${field} is too long`)
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) throw invalidConfig(`${field} contains control characters`)
  }
  return text
}

/** Never includes the offending value: one of these fields is the credential. */
function invalidConfig(problem: string): GatewayError {
  return new GatewayError("INVALID_INPUT", `The agent ${CREDENTIAL_STORE} is invalid: ${problem}.`)
}

function existsAsFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
