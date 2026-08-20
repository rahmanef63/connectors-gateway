/**
 * Wire contract between gateway, relay, and agent — docs/05-local-agent-protocol.md.
 * Deliberately connector-agnostic: nothing Blender-specific belongs here.
 */
import type { CapabilityReport, DevicePlatform, ErrorCode, ResultFile } from "@cg/core"
import type { SignedKeyRotation } from "./key-rotation"

export const PROTOCOL_VERSION = "1"

/** Signed unit of work delivered to a paired device. */
export type JobEnvelope = {
  id: string
  protocolVersion: string
  /** epoch ms */
  issuedAt: number
  expiresAt: number
  connector: string
  action: string
  input: unknown
  /** Attached server-side. The AI client can never supply these. */
  requestContext: {
    requestId: string
    userId: string
    workspaceId?: string
  }
  nonce: string
}

export type SignedJob = {
  payload: JobEnvelope
  /** base64url Ed25519 signature over the canonical JSON of `payload`. */
  signature: string
  keyId: string
}

export type AgentResult = {
  jobId: string
  status: "success" | "error"
  output?: unknown
  files?: ResultFile[]
  error?: { code: ErrorCode; message: string } | null
  timingMs: number
}

/** agent → gateway */
export type AgentMessage =
  | {
      type: "hello"
      protocolVersion: string
      deviceId: string
      credential: string
      platform: DevicePlatform
      agentVersion: string
      capabilities: CapabilityReport[]
    }
  | { type: "heartbeat" }
  | { type: "capabilities"; capabilities: CapabilityReport[] }
  | { type: "result"; result: AgentResult }

/** gateway → agent */
export type GatewayMessage =
  | { type: "welcome"; deviceId: string; protocolVersion: string; signingPublicKey: string; keyId: string; keyRotation?: SignedKeyRotation }
  | { type: "job"; job: SignedJob }
  | { type: "cancel"; jobId: string }
  | { type: "revoked"; reason: string }
  | { type: "error"; code: ErrorCode; message: string }

export const CLOSE_CODES = {
  /** Credential rejected — the agent must re-pair, not retry. */
  UNAUTHORIZED: 4001,
  /** Device revoked by its owner — stop reconnecting. */
  REVOKED: 4003,
  /** Protocol version mismatch. */
  UNSUPPORTED: 4004,
} as const

/** Reconnect backoff, capped. Jitter is applied by the agent. */
export const RECONNECT_BASE_MS = 1_000
export const RECONNECT_MAX_MS = 30_000
export const HEARTBEAT_INTERVAL_MS = 15_000
export const HEARTBEAT_TIMEOUT_MS = 45_000
export const DEFAULT_JOB_TTL_MS = 30_000
