/**
 * Process-side owner of the durable gateway singleton lease.
 *
 * The lease is acquired before Bun starts listening. Renewal failures are
 * tolerated only until the last Convex-confirmed expiry; an explicit refusal is
 * immediate loss. `isValid` is also checked at the HTTP/WebSocket edge, so even
 * a delayed process-exit path cannot continue serving after expiry.
 */
import {
  GATEWAY_LEASE_RENEW_MS,
  GatewayError,
} from "@cg/core"
import type { Logger } from "@cg/observability"
import type { ControlPlaneClient } from "./client"
import { REFS } from "./refs"

export type GatewayLeaseLossReason = "not_renewed" | "expired"

export type GatewayLease = {
  readonly holderId: string
  readonly lost: Promise<GatewayLeaseLossReason>
  acquire(): Promise<void>
  start(): void
  renewNow(): Promise<boolean>
  isValid(): boolean
  stop(): Promise<void>
}

export type GatewayLeaseOptions = {
  logger: Logger
  holderId?: string
  now?: () => number
  renewEveryMs?: number
}

type TimerHandle = ReturnType<typeof setTimeout>

type LeaseResult = { ok: boolean; expiresAt: number }

export function createGatewayLease(
  client: ControlPlaneClient,
  options: GatewayLeaseOptions,
): GatewayLease {
  const now = options.now ?? Date.now
  const renewEveryMs = options.renewEveryMs ?? GATEWAY_LEASE_RENEW_MS
  const holderId = options.holderId ?? newHolderId()
  if (!/^gw_[A-Za-z0-9_-]{16,96}$/.test(holderId)) {
    throw new GatewayError("INVALID_INPUT", "Gateway holder id is invalid.")
  }
  if (!Number.isSafeInteger(renewEveryMs) || renewEveryMs <= 0) {
    throw new GatewayError("INVALID_INPUT", "Gateway lease renewal interval is invalid.")
  }

  let expiresAt = 0
  let everAcquired = false
  let active = false
  let stopped = false
  let loss: GatewayLeaseLossReason | null = null
  let monitor: TimerHandle | null = null
  let expiryWatch: TimerHandle | null = null
  let inFlight: Promise<boolean> | null = null
  let resolveLost!: (reason: GatewayLeaseLossReason) => void
  const lost = new Promise<GatewayLeaseLossReason>((resolve) => {
    resolveLost = resolve
  })

  function clearTimers(): void {
    if (monitor !== null) clearInterval(monitor)
    if (expiryWatch !== null) clearTimeout(expiryWatch)
    monitor = null
    expiryWatch = null
  }

  function markLost(reason: GatewayLeaseLossReason): void {
    if (stopped || loss !== null) return
    loss = reason
    active = false
    clearTimers()
    options.logger.error("gateway singleton lease lost", { reason })
    resolveLost(reason)
  }

  function armExpiryWatch(): void {
    if (stopped || loss !== null || !active) return
    if (expiryWatch !== null) clearTimeout(expiryWatch)
    const delay = Math.max(0, expiresAt - now()) + 1
    expiryWatch = setTimeout(() => {
      expiryWatch = null
      if (stopped || loss !== null || !active) return
      if (now() >= expiresAt) markLost("expired")
      else armExpiryWatch()
    }, delay)
    unref(expiryWatch)
  }

  async function acquire(): Promise<void> {
    if (stopped) throw new GatewayError("INTERNAL", "Gateway lease owner is stopped.")
    if (active && now() < expiresAt) return

    const result = leaseResult(
      await client.mutation(REFS.gatewayLeaseAcquire, { holderId }),
      "acquired",
    )
    if (result === null) throw invalidState()
    if (!result.ok) {
      throw new GatewayError(
        "UPSTREAM_ERROR",
        "Another gateway process already owns the active singleton lease.",
      )
    }
    if (result.expiresAt <= now()) throw invalidState()

    expiresAt = result.expiresAt
    everAcquired = true
    active = true
    armExpiryWatch()
    options.logger.info("gateway singleton lease acquired", { expiresAt })
  }

  function start(): void {
    if (!isValid()) throw new GatewayError("INTERNAL", "Gateway singleton lease is not active.")
    if (monitor !== null) return
    monitor = setInterval(() => {
      void renewNow()
    }, renewEveryMs)
    unref(monitor)
  }

  function renewNow(): Promise<boolean> {
    if (stopped || loss !== null || !active) return Promise.resolve(false)
    if (inFlight !== null) return inFlight

    const renewal = (async (): Promise<boolean> => {
      try {
        const result = leaseResult(
          await client.mutation(REFS.gatewayLeaseRenew, { holderId }),
          "renewed",
        )
        if (stopped) return false
        if (result === null) {
          options.logger.error("gateway lease returned an invalid renewal response")
          if (now() >= expiresAt) markLost("expired")
          return false
        }
        if (!result.ok) {
          markLost("not_renewed")
          return false
        }
        if (result.expiresAt <= now()) {
          markLost("expired")
          return false
        }
        expiresAt = result.expiresAt
        armExpiryWatch()
        return true
      } catch {
        // Keep serving only inside the last lease Convex already confirmed. The
        // expiry watch is independent of this request, including a hung one.
        options.logger.warn("gateway singleton lease renewal failed")
        if (now() >= expiresAt) markLost("expired")
        return false
      }
    })().finally(() => {
      if (inFlight === renewal) inFlight = null
    })
    inFlight = renewal
    return renewal
  }

  function isValid(): boolean {
    return active && !stopped && loss === null && now() < expiresAt
  }

  async function stop(): Promise<void> {
    if (stopped) return
    stopped = true
    clearTimers()
    const shouldRelease = everAcquired && loss === null
    active = false
    if (!shouldRelease) return

    try {
      const released = releaseResult(
        await client.mutation(REFS.gatewayLeaseRelease, { holderId }),
      )
      if (released !== true) {
        options.logger.warn("gateway singleton lease was not released by this holder")
      }
    } catch {
      // The 30-second expiry is the safety net when Convex is unavailable while
      // the process exits. Never block process termination indefinitely here.
      options.logger.warn("gateway singleton lease release failed")
    }
  }

  return { holderId, lost, acquire, start, renewNow, isValid, stop }
}

function leaseResult(value: unknown, field: "acquired" | "renewed"): LeaseResult | null {
  if (!record(value) || typeof value[field] !== "boolean") return null
  if (
    typeof value.expiresAt !== "number" ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt <= 0
  ) {
    return null
  }
  return { ok: value[field], expiresAt: value.expiresAt }
}

function releaseResult(value: unknown): boolean | null {
  return record(value) && typeof value.released === "boolean" ? value.released : null
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function newHolderId(): string {
  return `gw_${crypto.randomUUID().replaceAll("-", "")}`
}

function invalidState(): GatewayError {
  return new GatewayError("UPSTREAM_ERROR", "The control plane returned an invalid gateway lease state.")
}

function unref(timer: TimerHandle): void {
  const candidate = timer as unknown as { unref?: () => void }
  candidate.unref?.()
}
