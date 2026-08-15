/**
 * Ports the executors depend on. Everything here is injected by the gateway:
 * this package performs no I/O of its own and holds no configuration.
 */
import type {
  ConnectionCredential,
  ConnectionStore,
  ConnectorManifest,
  DeviceStore,
  ResultFile,
} from "@cg/core"
import type { AgentResult, JobEnvelope, SignedJob } from "@cg/protocol"

/** Wall-clock budget for one execution when the request does not set one. */
export const DEFAULT_EXECUTION_TIMEOUT_MS = 30_000

/**
 * Delivers a signed job to a connected device and awaits its result.
 * Implemented by the relay inside apps/gateway — the executor never owns a socket.
 */
export interface JobDispatcher {
  dispatch(deviceId: string, job: SignedJob, timeoutMs: number): Promise<AgentResult>
}

/*
 * TODO(rr): CloudAdapter / AdapterOutput / CloudAdapterContext mirror @cg/sdk
 * structurally instead of importing it. packages/executor/package.json declares
 * only @cg/core + @cg/protocol and package manifests are owned by the spine, so
 * @cg/sdk does not resolve from here. The shapes are identical, so any
 * `defineCloudAdapter(...)` value satisfies this interface; collapse to a real
 * import the moment @cg/sdk is added as a dependency.
 */
export type AdapterOutput = {
  output: unknown
  files?: ResultFile[]
}

export type CloudAdapterContext = {
  requestId: string
  /** Resolved server-side from the stored connection. Never AI-supplied. */
  credential: ConnectionCredential
  signal: AbortSignal
}

export interface CloudAdapter {
  manifest: ConnectorManifest
  execute(actionId: string, input: unknown, context: CloudAdapterContext): Promise<AdapterOutput>
}

/**
 * Opens a stored credential ciphertext into a usable token.
 * Required, not optional: a missing implementation would silently ship
 * ciphertext upstream, and a fail-open crypto seam is worse than none.
 */
export type OpenCredential = (tokenCipher: string) => Promise<string> | string

export type CloudExecutorDeps = {
  /** connectorId -> adapter. */
  adapters: Map<string, CloudAdapter>
  connections: ConnectionStore
  openCredential: OpenCredential
  defaultTimeoutMs?: number
}

/** Signs a job envelope for a device. Key custody lives in @cg/auth. */
export type SignJob = (envelope: JobEnvelope) => Promise<SignedJob> | SignedJob

export type LocalExecutorDeps = {
  devices: DeviceStore
  dispatcher: JobDispatcher
  signJob: SignJob
  /** Envelope lifetime; the agent rejects an expired job (docs/05). */
  ttlMs?: number
  defaultTimeoutMs?: number
}
