/**
 * The single barrel for @cg/agent (rr P1). `main.ts` is the executable entry
 * point and is deliberately NOT re-exported: importing it would run the CLI.
 */
export { createAdapterRegistry, createDefaultRegistry, qualifyCapability } from "./adapters"
export type { AdapterRegistry, AvailableIndex } from "./adapters"
export {
  ALLOWLIST_REASONS,
  FORBIDDEN_ACTION_TOKENS,
  assertLocallyAllowed,
  evaluateLocalAllowlist,
  isForbiddenActionId,
  mostRestrictive,
} from "./allowlist"
export type { AllowlistDecision, AllowlistInput, AllowlistReason } from "./allowlist"
export { JITTER_RATIO, backoffDelay } from "./backoff"
export type { BackoffOptions } from "./backoff"
export { pairCommand, revokeLocalCommand, runCommand, statusCommand } from "./commands"
export type { CommandDeps } from "./commands"
export {
  CONFIG_FILE_NAME,
  DEFAULT_CONFIG_DIR_NAME,
  configPathIn,
  deleteConfig,
  loadConfig,
  parseConfig,
  requireGatewayUrl,
  resolveConfigDir,
  saveConfig,
  tryLoadConfig,
} from "./config"
export type { AgentConfig } from "./config"
export { httpBaseFrom, readAgentEnv, requireEnvGatewayUrl } from "./env"
export type { AgentEnv, EnvSource } from "./env"
export { DIR_MODE, FILE_MODE, assertPrivateMode, assertPrivatePath, isGroupOrWorldAccessible, supportsPosixModes } from "./file-mode"
export { HEARTBEAT_FRAME, capabilitiesFrame, encodeFrame, helloFrame, resultFrame } from "./frames"
export { createHeartbeat } from "./heartbeat"
export type { Heartbeat, HeartbeatOptions } from "./heartbeat"
export { DEFAULT_HTTP_TIMEOUT_MS, postJson } from "./http"
export type { FetchLike, PostJsonOptions } from "./http"
export { AGENT_VERSION, defaultDeviceName, detectPlatform, isDevicePlatform, stripControlChars } from "./identity"
export { UNKNOWN_JOB_ID, createJobRunner } from "./jobs"
export type { JobRunner, JobRunnerDeps } from "./jobs"
export { errorResult, redactPaths, sanitizeFiles, successResult } from "./job-result"
export { createLogger, silentLogger } from "./log"
export type { Logger, LoggerOptions } from "./log"
export {
  MAX_PAIRING_WAIT_MS,
  PAIR_CLAIM_PATH,
  PAIR_START_PATH,
  POLL_BASE_MS,
  POLL_MAX_MS,
  pollDelay,
  runPairing,
} from "./pairing"
export type { PairingOptions } from "./pairing"
export { claimResponse, startResponse } from "./pairing-parse"
export type { PairingClaim, PairingStart } from "./pairing-parse"
export { PERMANENT_CLOSE_CODES, closeAdvice, createSession } from "./session"
export type { ConnectionState, Session, SessionOptions } from "./session"
export { createInboundHandler } from "./session-inbound"
export type { InboundDeps, InboundHandler } from "./session-inbound"
export { NORMAL_CLOSURE, webSocketFactory } from "./socket"
export type { AgentSocket, SocketEvents, SocketFactory } from "./socket"
export { buildStatus, formatStatus } from "./status"
export type { AdapterStatus, StatusInput, StatusReport } from "./status"
export { DEFAULT_JOB_TIMEOUT_MS, raceTimeout } from "./timeout"
export { createJobVerifier, isKeyRotation } from "./verify"
export type { JobVerifier, PinnedKey } from "./verify"
export { createKeyStore, createKeyTruster } from "./key-store"
export type { KeyStore, KeyStoreOptions, TrustOutcome } from "./key-store"
