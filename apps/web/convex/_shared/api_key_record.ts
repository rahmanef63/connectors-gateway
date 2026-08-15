/**
 * API key wire shape for the gateway's `ApiKeyLookup` port (`@cg/auth`).
 * `secretHash` is PBKDF2 output; the plaintext secret never existed here.
 * `status` is returned rather than filtered, because `authenticateCaller`
 * distinguishes revoked from expired from unknown.
 */
import { type Infer, v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { apiKeyStatusValidator } from "./validators"

export const apiKeyRecordValidator = v.object({
  keyId: v.string(),
  userId: v.string(),
  workspaceId: v.optional(v.string()),
  scopes: v.array(v.string()),
  secretHash: v.string(),
  status: apiKeyStatusValidator,
})

export type ApiKeyRecord = Infer<typeof apiKeyRecordValidator>

export function toApiKeyRecord(doc: Doc<"apiKeys">): ApiKeyRecord {
  return {
    keyId: doc.keyId,
    userId: doc.userId,
    ...(doc.workspaceId === undefined ? {} : { workspaceId: doc.workspaceId }),
    scopes: doc.scopes,
    secretHash: doc.secretHash,
    status: doc.status,
  }
}
