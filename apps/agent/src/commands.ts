/**
 * The four CLI commands, as functions. `main.ts` only dispatches; everything
 * that can be tested lives here.
 */
import { createMemoryReplayGuard } from "@cg/protocol"
import { createDefaultRegistry } from "./adapters"
import type { AdapterRegistry } from "./adapters"
import { deleteConfig, loadConfig, saveConfig, tryLoadConfig } from "./config"
import type { AgentConfig } from "./config"
import { readAgentEnv, requireEnvGatewayUrl } from "./env"
import type { EnvSource } from "./env"
import { AGENT_VERSION, defaultDeviceName, detectPlatform } from "./identity"
import { createJobRunner } from "./jobs"
import { createKeyStore } from "./key-store"
import type { PinnedKey } from "./key-store"
import { createLogger } from "./log"
import type { Logger } from "./log"
import { runPairing } from "./pairing"
import { createSession } from "./session"
import type { Session } from "./session"
import { formatStatus } from "./status"

export type CommandDeps = {
  env?: EnvSource
  print?: (line: string) => void
  logger?: Logger
  /** Injected in tests so no adapter probes a real bridge. */
  registry?: AdapterRegistry
}

export async function pairCommand(deps: CommandDeps = {}): Promise<void> {
  const env = readAgentEnv(deps.env ?? process.env)
  const print = deps.print ?? console.log
  const config = await runPairing({
    gatewayUrl: requireEnvGatewayUrl(env),
    configDir: env.configDir,
    deviceName: defaultDeviceName(),
    platform: detectPlatform(),
    print,
  })
  // The credential is in the store and nowhere else — not in this output.
  print("  Stored the device credential in the agent config directory, owner-only.")
  print("  Start the agent with: agent run")
  print(`  Device: ${config.deviceId}`)
}

export async function runCommand(deps: CommandDeps = {}): Promise<Session> {
  const env = readAgentEnv(deps.env ?? process.env)
  const logger = deps.logger ?? createLogger()
  const stored = loadConfig(env.configDir)
  // An explicit CG_GATEWAY_URL wins, so a relocated gateway does not need a re-pair.
  const config = env.gatewayUrl === undefined ? stored : { ...stored, gatewayUrl: env.gatewayUrl }

  const registry = deps.registry ?? createDefaultRegistry(deps.env ?? process.env)
  // The signing key is pinned here, learned from `welcome` on the first run and
  // written back to the credential store so later runs start already pinned.
  const keys = createKeyStore({
    initial: pinnedKeyOf(config),
    persist: (key) => void saveConfig(env.configDir, { ...stored, ...key }),
  })
  const runner = createJobRunner({
    registry,
    verify: keys.verify,
    replay: createMemoryReplayGuard(),
    disabledActions: config.disabledActions,
  })

  const session = createSession({ config, registry, runner, keys, logger })
  logger.info(`connectors agent ${AGENT_VERSION} connecting outbound to the gateway`)
  session.start()
  return session
}

/** Both fields or neither; config.ts already enforces that pairing. */
function pinnedKeyOf(config: AgentConfig): PinnedKey | undefined {
  if (config.signingPublicKey === undefined || config.keyId === undefined) return undefined
  return { signingPublicKey: config.signingPublicKey, keyId: config.keyId }
}

export async function statusCommand(deps: CommandDeps = {}): Promise<string> {
  const env = readAgentEnv(deps.env ?? process.env)
  const print = deps.print ?? console.log
  const config = tryLoadConfig(env.configDir)
  const registry = deps.registry ?? createDefaultRegistry(deps.env ?? process.env)
  const reports = await registry.detectAll()

  const text = formatStatus(config, reports, "idle")
  print(text)
  return text
}

/**
 * Local-only: it forgets the credential on THIS machine. The device record in
 * the control plane is unaffected, and that is the one that ends live sessions
 * (docs/04 "Revoking a device terminates its active session").
 */
export function revokeLocalCommand(deps: CommandDeps = {}): string {
  const env = readAgentEnv(deps.env ?? process.env)
  const print = deps.print ?? console.log
  const removed = deleteConfig(env.configDir)
  const text = removed
    ? "Local device credential deleted. Revoke the device in the dashboard too — that is what ends any live session."
    : "No local device credential was stored."
  print(text)
  return text
}
