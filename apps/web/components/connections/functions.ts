/**
 * The Connections screen's coupling to the control plane.
 *
 * PINNED CONTRACT — verified against
 * `convex/features/connections/{queries,mutations}.ts`:
 *
 *   queries:listMine   ()                                          -> summaries[]
 *   mutations:upsert   ({ connectorId, baseUrl, tokenCipher,
 *                         authType })                              -> { connectionId }
 *   mutations:remove   ({ connectorId })                           -> null
 *
 * `remove` is keyed by CONNECTOR, not by row id: the control plane keeps one
 * credential per (owner, connector) and deletes every row for that pair, so a
 * connection id here would be an id the mutation does not accept.
 *
 * `tokenCipher` is the only credential-shaped argument the browser ever sends,
 * and it is ciphertext the operator produced on the gateway host — neither this
 * app nor Convex holds the key that opens it.
 */
import type { AuthType } from "@cg/core"

import { api } from "@convex/_generated/api"

export type UpsertConnectionArgs = {
  connectorId: string
  baseUrl: string
  tokenCipher: string
  authType: AuthType
}

export const connectionFunctions = {
  listMine: api.features.connections.queries.listMine,
  upsert: api.features.connections.mutations.upsert,
  remove: api.features.connections.mutations.remove,
} as const
