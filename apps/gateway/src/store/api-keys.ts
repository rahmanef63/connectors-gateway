/**
 * ApiKeyLookup backed by Convex. The row carries `secretHash` only; the
 * comparison happens inside @cg/auth, never here.
 */
import type { ApiKeyLookup, ApiKeyRecord } from "@cg/auth"
import type { ControlPlaneClient } from "./client"
import { toApiKeyRecord } from "./guards"
import { REFS } from "./refs"

export function createApiKeyLookup(client: ControlPlaneClient): ApiKeyLookup {
  return {
    async getApiKey(keyId: string): Promise<ApiKeyRecord | null> {
      return toApiKeyRecord(await client.query(REFS.apiKeysGetRecord, { keyId }))
    },
  }
}
