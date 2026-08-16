/**
 * The inbound job pipeline. Fixed order, no shortcuts (docs/05, docs/14):
 *
 *   parseGatewayMessage  (session.ts, at the socket edge)
 *   -> verifyJob         signature, key id, expiry, protocol version
 *   -> replay guard      a job id is executable exactly once
 *   -> local allowlist   independent of what the gateway decided
 *   -> adapter execute   with a hard timeout and a cancellable signal
 *   -> AgentResult       success or a structured error, always exactly one
 *
 * Every failure becomes an `AgentResult` with `status: "error"`. Nothing is ever
 * dropped silently, and `run` never rejects — an unhandled rejection here would
 * take the whole session down with it.
 */
import { GatewayError } from "@cg/core"
import type { ReplayGuard } from "@cg/core"
import type { AgentResult, JobEnvelope, SignedJob } from "@cg/protocol"
import type { AdapterOutput, LocalAdapter } from "@cg/sdk"
import type { AdapterRegistry } from "./adapters"
import { assertLocallyAllowed } from "./allowlist"
import { stripControlChars } from "./identity"
import { errorResult, successResult } from "./job-result"
import { DEFAULT_JOB_TIMEOUT_MS, raceTimeout } from "./timeout"
import type { JobVerifier } from "./key-store"

/** Correlation id used when the frame carries no usable one. Never a real job. */
export const UNKNOWN_JOB_ID = "job_unknown"

export type JobRunnerDeps = {
  registry: AdapterRegistry
  verify: JobVerifier
  replay: ReplayGuard
  /** Read from the credential store; the user's own local switch. */
  disabledActions: readonly string[]
  timeoutMs?: number
  now?: () => number
}

export type JobRunner = {
  run(signed: SignedJob): Promise<AgentResult>
  cancel(jobId: string): boolean
  inflight(): number
}

export function createJobRunner(deps: JobRunnerDeps): JobRunner {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS
  const now = deps.now ?? Date.now
  const inflight = new Map<string, AbortController>()

  return {
    async run(signed: SignedJob): Promise<AgentResult> {
      const jobId = readJobId(signed)
      const startedAt = now()
      try {
        const envelope = await deps.verify(signed)
        await assertFresh(deps.replay, envelope, now())
        const adapter = authorize(deps, envelope)
        const output = await execute(adapter, envelope, inflight, timeoutMs)
        return successResult(envelope.id, output, now() - startedAt)
      } catch (cause) {
        return errorResult(jobId, cause, now() - startedAt)
      }
    },

    cancel(jobId: string): boolean {
      const controller = inflight.get(jobId)
      if (controller === undefined) return false
      controller.abort()
      return true
    },

    inflight: () => inflight.size,
  }
}

/**
 * Resolves the action from a REGISTERED adapter's manifest and runs the local
 * allowlist. The envelope only names a connector and an action; it never carries
 * risk, policy or capability claims the agent would trust.
 */
function authorize(deps: JobRunnerDeps, envelope: JobEnvelope): LocalAdapter {
  const action = deps.registry.findAction(envelope.connector, envelope.action)
  assertLocallyAllowed({
    connectorId: envelope.connector,
    actionId: envelope.action,
    action,
    available: deps.registry.available(),
    disabledActions: deps.disabledActions,
  })
  const adapter = deps.registry.get(envelope.connector)
  if (adapter === undefined) {
    throw new GatewayError("NOT_AUTHORIZED", "This device does not allow this action (unknown_action).")
  }
  return adapter
}

async function assertFresh(replay: ReplayGuard, envelope: JobEnvelope, now: number): Promise<void> {
  // The remaining lifetime is the only window a replay could land in; the
  // envelope's own expiry check already rejected anything older.
  const ttlMs = Math.max(1, envelope.expiresAt - now)
  const fresh = await replay.remember(envelope.id, ttlMs)
  if (!fresh) throw new GatewayError("REPLAY_DETECTED", "This job was already delivered to this device.")
}

async function execute(
  adapter: LocalAdapter,
  envelope: JobEnvelope,
  inflight: Map<string, AbortController>,
  timeoutMs: number,
): Promise<AdapterOutput> {
  const controller = new AbortController()
  inflight.set(envelope.id, controller)
  try {
    const work = adapter.execute(envelope.action, envelope.input, {
      requestId: envelope.requestContext.requestId,
      signal: controller.signal,
    })
    return await raceTimeout(work, timeoutMs, "The local action timed out.")
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new GatewayError("CANCELLED", "The job was cancelled.")
    }
    throw cause
  } finally {
    // The adapter keeps running if it ignored the signal, but its slot is freed.
    controller.abort()
    inflight.delete(envelope.id)
  }
}

/**
 * The frame was already shape-validated by `parseGatewayMessage`, so this id is
 * well-formed — but it is NOT yet authenticated. It is used only to correlate a
 * failure back to the gateway's own in-flight table; no privilege follows from it.
 */
function readJobId(signed: SignedJob): string {
  const id: unknown = (signed as { payload?: { id?: unknown } } | null)?.payload?.id
  if (typeof id !== "string") return UNKNOWN_JOB_ID
  const clean = stripControlChars(id)
  return clean.length > 0 && clean.length <= 512 ? clean : UNKNOWN_JOB_ID
}
