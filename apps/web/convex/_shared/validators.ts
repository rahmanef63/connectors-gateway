/**
 * Primitive field validators. Every union that `@cg/core` exports as a const
 * array is derived from it, so the schema cannot drift from the spine. The
 * remaining unions are bare TS types upstream, so they are written out here
 * and pinned with a compile-time exactness check.
 */
import { type Infer, v } from "convex/values"
import {
  AUTH_TYPES,
  DEVICE_PLATFORMS,
  ERROR_CODES,
  EXECUTOR_KINDS,
  POLICY_DECISIONS,
  type ConnectionStatus,
  type DeviceStatus,
} from "@cg/core"

export const platformValidator = v.union(...DEVICE_PLATFORMS.map((value) => v.literal(value)))
export const authTypeValidator = v.union(...AUTH_TYPES.map((value) => v.literal(value)))
export const policyDecisionValidator = v.union(...POLICY_DECISIONS.map((value) => v.literal(value)))
export const executorKindValidator = v.union(...EXECUTOR_KINDS.map((value) => v.literal(value)))
export const errorCodeValidator = v.union(...ERROR_CODES.map((value) => v.literal(value)))

export const deviceStatusValidator = v.union(
  v.literal("online"),
  v.literal("offline"),
  v.literal("revoked"),
)

export const challengeStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("claimed"),
  v.literal("expired"),
)

export const connectionStatusValidator = v.union(
  v.literal("active"),
  v.literal("expired"),
  v.literal("revoked"),
  v.literal("error"),
)

export const ownerTypeValidator = v.union(v.literal("user"), v.literal("workspace"))

export const apiKeyStatusValidator = v.union(
  v.literal("active"),
  v.literal("revoked"),
  v.literal("expired"),
)

export const auditStatusValidator = v.union(v.literal("success"), v.literal("error"))

/** Both directions, so neither widening nor narrowing can slip through. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

const _deviceStatusMatchesSpine: Exact<Infer<typeof deviceStatusValidator>, DeviceStatus> = true
const _connectionStatusMatchesSpine: Exact<
  Infer<typeof connectionStatusValidator>,
  ConnectionStatus
> = true

export const SPINE_CHECKS = [_deviceStatusMatchesSpine, _connectionStatusMatchesSpine] as const
