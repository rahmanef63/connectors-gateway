/**
 * ConnectionStore backed by Convex, including coordinated OAuth renewal.
 *
 * Convex stores ciphertext and lease metadata only. A gateway opens the sealed
 * renewal document after winning a short lease, exchanges it directly with the
 * authorization server, immediately seals the rotated secrets, and commits by
 * credential generation. The public ConnectionStore still returns only a sealed
 * access token; @cg/executor opens it at the adapter-call boundary.
 */
import {
  GatewayError,
  encodeOAuthRenewal,
  parseOAuthRenewal,
  type Connection,
  type ConnectionCredential,
  type ConnectionStore,
} from "@cg/core"
import type { Logger } from "@cg/observability"
import type { ControlPlaneClient } from "./client"
import {
  toConnections,
  toRefreshDecision,
  toStoredCredential,
  toUpdateResult,
  type StoredCredential,
} from "./guards"
import { REFS } from "./refs"
import {
  OAuthRefreshError,
  credentialNeedsRefresh,
  refreshOAuthToken,
  type FetchLike,
} from "./token-refresh"

const MAX_WAIT_PASSES = 12
const MAX_WAIT_SLICE_MS = 1_000

export type ConnectionStoreOptions = {
  openCredential(ciphertext: string): Promise<string>
  sealCredential(plaintext: string): Promise<string>
  logger: Logger
  /** Test seams. */
  fetcher?: FetchLike
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  newLeaseId?: () => string
}

export function createConnectionStore(
  client: ControlPlaneClient,
  options: ConnectionStoreOptions,
): ConnectionStore {
  const inFlight = new Map<string, Promise<ConnectionCredential | null>>()
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  async function queryStored(userId: string, connectorId: string): Promise<StoredCredential | null> {
    return toStoredCredential(
      await client.query(REFS.connectionsResolveCredential, { userId, connectorId }),
    )
  }

  async function resolveExpiring(
    userId: string,
    connectorId: string,
    initial: StoredCredential,
  ): Promise<ConnectionCredential | null> {
    const leaseId = (options.newLeaseId ?? defaultLeaseId)()
    let current = initial

    for (let pass = 0; pass < MAX_WAIT_PASSES; pass += 1) {
      const decision = toRefreshDecision(
        await client.mutation(REFS.connectionsBeginRefresh, {
          userId,
          connectorId,
          connectionId: current.connectionId,
          leaseId,
        }),
      )
      if (decision === null) throw unavailable()
      if (decision.state === "missing") return null
      if (decision.state === "ready") return publicCredential(decision.credential)

      if (decision.state === "wait") {
        await sleep(Math.min(decision.retryAfterMs, MAX_WAIT_SLICE_MS))
        const afterWait = await queryStored(userId, connectorId)
        if (afterWait === null) return null
        if (!credentialNeedsRefresh(afterWait.tokenExpiresAt, now())) {
          return publicCredential(afterWait)
        }
        current = afterWait
        continue
      }

      return renewOwnedLease(userId, connectorId, leaseId, decision.credential)
    }
    throw new GatewayError("UPSTREAM_ERROR", "The connector authorization is still being renewed.")
  }

  async function renewOwnedLease(
    userId: string,
    connectorId: string,
    leaseId: string,
    stored: StoredCredential,
  ): Promise<ConnectionCredential | null> {
    if (stored.renewalCipher === undefined) {
      await abort(userId, connectorId, leaseId, stored, true)
      return null
    }

    let renewalPlaintext: string
    try {
      renewalPlaintext = await options.openCredential(stored.renewalCipher)
    } catch {
      // A bad deployment key affects every credential and must not mark a user's
      // otherwise-valid connection permanently expired.
      await abort(userId, connectorId, leaseId, stored, false)
      throw new GatewayError("INTERNAL", "The connector credential could not be opened.")
    }

    const renewal = parseOAuthRenewal(renewalPlaintext)
    renewalPlaintext = ""
    if (renewal === null) {
      await abort(userId, connectorId, leaseId, stored, true)
      return null
    }

    try {
      const refreshed = await refreshOAuthToken(renewal, {
        ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
        now,
      })
      const tokenCipher = await options.sealCredential(refreshed.accessToken)
      const renewalCipher = await options.sealCredential(encodeOAuthRenewal(refreshed.renewal))
      const committed = toUpdateResult(
        await client.mutation(REFS.connectionsFinishRefresh, {
          userId,
          connectorId,
          connectionId: stored.connectionId,
          expectedVersion: stored.credentialVersion,
          leaseId,
          tokenCipher,
          ...(refreshed.tokenExpiresAt === undefined
            ? {}
            : { tokenExpiresAt: refreshed.tokenExpiresAt }),
          renewalCipher,
        }),
      )
      if (committed === null) throw unavailable()
      if (committed) {
        options.logger.info("upstream OAuth credential renewed", {
          connectorId,
          connectionId: stored.connectionId,
        })
        return {
          connectionId: stored.connectionId,
          baseUrl: stored.baseUrl,
          token: tokenCipher,
        }
      }

      // A reconnect or another generation won while the HTTP request was in
      // flight. Use the winner only if it is actually fresh.
      const winner = await queryStored(userId, connectorId)
      return winner !== null && !credentialNeedsRefresh(winner.tokenExpiresAt, now())
        ? publicCredential(winner)
        : null
    } catch (error) {
      if (error instanceof OAuthRefreshError) {
        await abort(userId, connectorId, leaseId, stored, error.permanent)
        if (error.permanent) return null
        throw new GatewayError(
          "UPSTREAM_ERROR",
          "The connector authorization could not be renewed.",
        )
      }
      await abort(userId, connectorId, leaseId, stored, false)
      throw error
    }
  }

  async function abort(
    userId: string,
    connectorId: string,
    leaseId: string,
    stored: StoredCredential,
    permanent: boolean,
  ): Promise<void> {
    try {
      await client.mutation(REFS.connectionsAbortRefresh, {
        userId,
        connectorId,
        connectionId: stored.connectionId,
        expectedVersion: stored.credentialVersion,
        leaseId,
        permanent,
      })
    } catch {
      // The original, already-sanitized refresh failure is more useful. A lease
      // that cannot be released expires by itself after twenty seconds.
    }
  }

  return {
    async listForUser(userId: string): Promise<Connection[]> {
      return toConnections(await client.query(REFS.connectionsListForUser, { userId }))
    },

    async resolveCredential(
      userId: string,
      connectorId: string,
    ): Promise<ConnectionCredential | null> {
      const stored = await queryStored(userId, connectorId)
      if (stored === null) return null
      if (!credentialNeedsRefresh(stored.tokenExpiresAt, now())) return publicCredential(stored)

      const existing = inFlight.get(stored.connectionId)
      if (existing !== undefined) return existing
      const refreshing = resolveExpiring(userId, connectorId, stored).finally(() => {
        if (inFlight.get(stored.connectionId) === refreshing) inFlight.delete(stored.connectionId)
      })
      inFlight.set(stored.connectionId, refreshing)
      return refreshing
    },
  }
}

function publicCredential(stored: StoredCredential): ConnectionCredential {
  return {
    connectionId: stored.connectionId,
    baseUrl: stored.baseUrl,
    token: stored.tokenCipher,
  }
}

function defaultLeaseId(): string {
  return `lease_${crypto.randomUUID().replaceAll("-", "")}`
}

function unavailable(): GatewayError {
  return new GatewayError("UPSTREAM_ERROR", "The control plane returned an invalid refresh state.")
}
