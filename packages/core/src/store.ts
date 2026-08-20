/**
 * Control-plane ports. The gateway depends on these interfaces only; the
 * production implementation is Convex (apps/gateway/src/store), and tests
 * substitute in-memory fakes. One port, one production implementation.
 */
import type { AuditSink } from "./audit"
import type {
  Connection,
  ConnectionCredential,
  Device,
  DevicePlatform,
  PolicyRule,
} from "./device"

export type PairingChallenge = {
  id: string
  code: string
  deviceName: string
  platform: DevicePlatform
  status: "pending" | "approved" | "claimed" | "expired"
  expiresAt: number
  userId?: string
}

export type DeviceRegistration = {
  device: Device
  /** Plaintext device credential — returned exactly once, at claim time. */
  credential: string
}

export interface DeviceStore {
  get(deviceId: string): Promise<Device | null>
  listForUser(userId: string): Promise<Device[]>
  /** Verify a presented credential. Returns null for wrong/rotated/revoked. */
  authenticate(deviceId: string, credential: string): Promise<Device | null>
  setPresence(deviceId: string, online: boolean, capabilities?: string[]): Promise<void>
}

export interface PairingStore {
  /** Agent side: start a pairing attempt, get a short-lived code. */
  createChallenge(input: {
    deviceName: string
    platform: DevicePlatform
    ttlMs: number
  }): Promise<PairingChallenge>
  /** Agent side: one-time claim of the device credential. */
  claim(challengeId: string): Promise<DeviceRegistration | null>
}

export interface PolicyStore {
  listRules(userId: string, connectorId: string): Promise<PolicyRule[]>
}

export interface ConnectionStore {
  listForUser(userId: string): Promise<Connection[]>
  /** Gateway-internal credential for a cloud call. Its token may remain sealed
   * until the executor opens it immediately before the adapter invocation. */
  resolveCredential(userId: string, connectorId: string): Promise<ConnectionCredential | null>
}

/** Rejects replayed job ids. Returns false when the id was already seen. */
export interface ReplayGuard {
  remember(jobId: string, ttlMs: number): Promise<boolean>
}

export type ControlPlane = {
  devices: DeviceStore
  pairing: PairingStore
  policy: PolicyStore
  connections: ConnectionStore
  audit: AuditSink
}
