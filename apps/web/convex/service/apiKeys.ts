/**
 * Gateway-facing API key lookup — the `ApiKeyLookup` port in `@cg/auth`.
 * "service/apiKeys:getRecord".
 *
 * File name is camelCase because the function reference is pinned across
 * processes; kebab-case would change the string the gateway calls.
 */
import { v } from "convex/values"
import { query } from "../_generated/server"
import { apiKeyRecordValidator, toApiKeyRecord, type ApiKeyRecord } from "../_shared/api_key_record"
import { requireService } from "../_shared/auth"
import { assertIdentifier } from "../_shared/input"
import { apiKeyByKeyId } from "../_shared/lookup"

/**
 * `status` is returned rather than filtered: `authenticateCaller` must be able
 * to tell revoked from expired from unknown, and it verifies `secretHash`
 * itself in constant time.
 */
export const getRecord = query({
  args: { serviceToken: v.string(), keyId: v.string() },
  returns: v.union(apiKeyRecordValidator, v.null()),
  handler: async (ctx, args): Promise<ApiKeyRecord | null> => {
    requireService(ctx, args.serviceToken)
    const key = await apiKeyByKeyId(ctx, assertIdentifier(args.keyId, "keyId"))
    return key === null ? null : toApiKeyRecord(key)
  },
})
