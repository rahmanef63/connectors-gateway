/**
 * ConnectionStore backed by Convex.
 *
 * Convex stores `tokenCipher` and never holds a key. `resolveCredential` hands
 * the ciphertext on in `ConnectionCredential.token`; @cg/executor's
 * `openCredential` seam is the only place it is decrypted, and the plaintext
 * exists solely for the duration of one adapter call (docs/03).
 */
import type { Connection, ConnectionCredential, ConnectionStore } from "@cg/core"
import type { ControlPlaneClient } from "./client"
import { toConnections, toStoredCredential } from "./guards"
import { REFS } from "./refs"

export function createConnectionStore(client: ControlPlaneClient): ConnectionStore {
  return {
    async listForUser(userId: string): Promise<Connection[]> {
      return toConnections(await client.query(REFS.connectionsListForUser, { userId }))
    },

    async resolveCredential(
      userId: string,
      connectorId: string,
    ): Promise<ConnectionCredential | null> {
      const stored = toStoredCredential(
        await client.query(REFS.connectionsResolveCredential, { userId, connectorId }),
      )
      if (!stored) return null
      // `token` is still SEALED here. Never log it, never return it to a client.
      return {
        connectionId: stored.connectionId,
        baseUrl: stored.baseUrl,
        token: stored.tokenCipher,
      }
    },
  }
}
