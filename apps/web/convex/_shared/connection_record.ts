/**
 * Connection wire shapes. `tokenCipher` leaves this deployment through exactly
 * one function (`service/connections:resolveCredential`) and is ciphertext at
 * every point — the gateway and the dashboard's connect flow hold
 * `CREDENTIAL_ENCRYPTION_KEY`; Convex never does.
 */
import { type Infer, v } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import { authTypeValidator, connectionStatusValidator, ownerTypeValidator } from "./validators"

export const connectionRecordValidator = v.object({
  id: v.string(),
  connectorId: v.string(),
  ownerType: ownerTypeValidator,
  ownerId: v.string(),
  authType: authTypeValidator,
  status: connectionStatusValidator,
})

/** Dashboard shape: no owner echo, no ciphertext. */
export const connectionSummaryValidator = v.object({
  connectionId: v.string(),
  connectorId: v.string(),
  authType: authTypeValidator,
  status: connectionStatusValidator,
  baseUrl: v.string(),
})

export const credentialValidator = v.object({
  connectionId: v.string(),
  baseUrl: v.string(),
  tokenCipher: v.string(),
  tokenExpiresAt: v.optional(v.number()),
  renewalCipher: v.optional(v.string()),
  credentialVersion: v.number(),
})

export type ConnectionRecord = Infer<typeof connectionRecordValidator>
export type ConnectionSummary = Infer<typeof connectionSummaryValidator>
export type CredentialRecord = Infer<typeof credentialValidator>

export function toConnectionRecord(doc: Doc<"connections">): ConnectionRecord {
  return {
    id: doc._id,
    connectorId: doc.connectorId,
    ownerType: doc.ownerType,
    ownerId: doc.ownerId,
    authType: doc.authType,
    status: doc.status,
  }
}

export function toConnectionSummary(doc: Doc<"connections">): ConnectionSummary {
  return {
    connectionId: doc._id,
    connectorId: doc.connectorId,
    authType: doc.authType,
    status: doc.status,
    baseUrl: doc.baseUrl,
  }
}

export function toCredential(doc: Doc<"connections">): CredentialRecord {
  return {
    connectionId: doc._id,
    baseUrl: doc.baseUrl,
    tokenCipher: doc.tokenCipher,
    credentialVersion: doc.credentialVersion ?? 1,
    ...(doc.tokenExpiresAt === undefined ? {} : { tokenExpiresAt: doc.tokenExpiresAt }),
    ...(doc.renewalCipher === undefined ? {} : { renewalCipher: doc.renewalCipher }),
  }
}
