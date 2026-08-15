/**
 * The API-key surface's single point of coupling to the control plane.
 *
 * PINNED CONTRACT — verified against `convex/features/api_keys/*`:
 *
 *   queries:listMine   ()          -> { keyId, label, status, createdAt, lastUsedAt? }[]
 *   mutations:issue    ({ label }) -> { key, keyId }   — the raw key, ONCE
 *   mutations:revoke   ({ keyId }) -> null
 *
 * `issue` returns the only copy of the secret that will ever exist. It is still
 * read by SHAPE in `./read.ts` rather than by field name, so a rename upstream
 * degrades to an honest "could not display it" instead of silently losing a
 * credential the user can never get back.
 */
import { api } from "@convex/_generated/api"

export const apiKeyFunctions = {
  listMine: api.features.api_keys.queries.listMine,
  issue: api.features.api_keys.mutations.issue,
  revoke: api.features.api_keys.mutations.revoke,
} as const
