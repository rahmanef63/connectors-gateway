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
  /**
   * Load-bearing, not informational: `authenticateCaller` is the ONLY thing
   * that enforces the lifetime of an OAuth-issued token, and it can only refuse
   * an expiry it can see. Dropping this field here would store the expiry and
   * never apply it — every OAuth grant silently immortal.
   */
  expiresAt: v.optional(v.number()),
  /** RFC 8707 audience on an OAuth token; absent on manual/legacy keys. */
  audience: v.optional(v.string()),
})

export type ApiKeyRecord = Infer<typeof apiKeyRecordValidator>

/**
 * Refused-on-sight expiry for a malformed OAuth grant. Epoch 0 is always in the
 * past, so `authenticateCaller`'s existing `expiresAt <= now` check rejects it
 * with no new branch anywhere.
 */
const ALREADY_EXPIRED = 0

export function toApiKeyRecord(doc: Doc<"apiKeys">): ApiKeyRecord {
  // `clientId` set means the row is an OAuth grant, and the schema says those
  // ALWAYS carry an expiry — but "always" is a sentence in a comment, not a
  // constraint the database can enforce, and `expiresAt` is optional because
  // hand-minted keys legitimately have none. So a grant that reaches here
  // without one is a row that should not exist, and the only safe reading of it
  // is "expired": the alternative is a consent the user gave once, in a browser,
  // that authorises an AI client forever and can only be ended by finding and
  // revoking it by hand. Fail closed, and let the sign-in flow mint a fresh one.
  const expiresAt =
    doc.clientId !== undefined && doc.expiresAt === undefined ? ALREADY_EXPIRED : doc.expiresAt

  return {
    keyId: doc.keyId,
    userId: doc.userId,
    ...(doc.workspaceId === undefined ? {} : { workspaceId: doc.workspaceId }),
    scopes: doc.scopes,
    secretHash: doc.secretHash,
    status: doc.status,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(doc.audience === undefined ? {} : { audience: doc.audience }),
  }
}
