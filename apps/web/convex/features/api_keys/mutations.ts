/**
 * API key issuance and revocation — the product's front door
 * (docs/08-auth-and-identity.md).
 *
 * The credential is `cgk_<keyId>_<secret>`: the id travels in clear so the
 * gateway can look the row up by index and hash only the secret. `issue`
 * returns that string ONCE and stores only its PBKDF2 hash; nothing here, and
 * no query anywhere, can hand the secret back afterwards.
 *
 * Hashing calls `@cg/auth` directly rather than reimplementing the format,
 * because the gateway verifies with that same module: one function, nothing to
 * drift. `features/api_keys/compat.test.ts` is the guard on that claim.
 */
import { v } from "convex/values"
import { grantedScopes } from "@cg/core"
import { TOKEN_PREFIXES, formatToken, hashSecret, newCredentialSecret } from "@cg/auth"
import { mutation } from "../../_generated/server"
import type { MutationCtx } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import { fail } from "../../_shared/errors"
import { assertDisplayName, assertIdentifier } from "../../_shared/input"
import { apiKeyByKeyId } from "../../_shared/lookup"
import { API_KEY_ID_PREFIX, MAX_ACTIVE_API_KEYS_PER_USER } from "./limits"

export const issue = mutation({
  args: { label: v.string() },
  returns: v.object({ key: v.string(), keyId: v.string() }),
  handler: async (ctx, args): Promise<{ key: string; keyId: string }> => {
    const userId = await requireUser(ctx)
    const label = assertDisplayName(args.label)
    await assertUnderCap(ctx, userId)

    const keyId = newKeyId()
    // Astronomically unlikely, but a collision would silently shadow another
    // row in the gateway's lookup, so it is checked rather than assumed.
    if ((await apiKeyByKeyId(ctx, keyId)) !== null) {
      fail("INTERNAL", "Could not issue an API key. Try again.")
    }

    // Hex, not base64url: `formatToken` forbids `_` in the secret so the LAST
    // `_` unambiguously splits key id from secret. `@cg/core`'s `randomToken()`
    // is base64url and would intermittently contain `_`, so it is not used here.
    const secret = newCredentialSecret()
    const key = mintToken(keyId, secret)
    const secretHash = await mintHash(secret)

    await ctx.db.insert("apiKeys", {
      keyId,
      userId,
      // The full vocabulary, because there is nowhere for the user to choose a
      // subset yet. The comment that used to sit here claimed an empty list was
      // least privilege and cost nothing "because every action requires none" —
      // that stopped being true the moment a manifest declared `requiredScopes`,
      // and the connector that declared them silently vanished from every
      // catalog. Narrowing this is a real feature; it needs a UI first, and
      // until then handing out less only hides the user's own connectors.
      scopes: grantedScopes(),
      secretHash,
      status: "active",
      label,
    })

    // The one and only time the raw key exists outside this request.
    return { key, keyId }
  },
})

/**
 * Terminal and idempotent. The row stays so `service/apiKeys:getRecord` can
 * answer "revoked" rather than "unknown" — different facts, even though both
 * deny the request.
 */
export const revoke = mutation({
  args: { keyId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await requireUser(ctx)
    const key = await apiKeyByKeyId(ctx, assertIdentifier(args.keyId, "keyId"))
    // Missing and foreign give the identical answer on purpose: any difference
    // turns this into an existence oracle for other users' key ids.
    if (key === null || key.userId !== userId) fail("NOT_AUTHORIZED", "API key not found.")
    if (key.status !== "revoked") {
      await ctx.db.patch(key._id, { status: "revoked" })
    }
    return null
  },
})

/** `key_<32 hex>` — the `newId` shape, minted locally (see `limits.ts`). */
function newKeyId(): string {
  return `${API_KEY_ID_PREFIX}_${crypto.randomUUID().replaceAll("-", "")}`
}

/**
 * Exact active-key cap. Revoked rows deliberately live forever so the gateway
 * can distinguish "revoked" from "unknown"; the compound index keeps that
 * audit history from making issuance slower or eventually blocking rotation.
 */
async function assertUnderCap(ctx: MutationCtx, userId: string): Promise<void> {
  const active = await ctx.db
    .query("apiKeys")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .take(MAX_ACTIVE_API_KEYS_PER_USER)
  if (active.length >= MAX_ACTIVE_API_KEYS_PER_USER) {
    fail("RATE_LIMITED", "Too many API keys. Revoke one before issuing another.")
  }
}

/**
 * `@cg/auth` throws `GatewayError`; a Convex function may only throw
 * `ConvexError` for the payload to survive the wire. Both call sites are fed
 * machine-generated values, so this is a guard against a future format change,
 * not an expected path — and it never forwards the original message.
 */
function mintToken(keyId: string, secret: string): string {
  try {
    return formatToken(TOKEN_PREFIXES.apiKey, keyId, secret)
  } catch {
    fail("INTERNAL", "Could not issue an API key.")
  }
}

async function mintHash(secret: string): Promise<string> {
  try {
    return await hashSecret(secret)
  } catch {
    fail("INTERNAL", "Could not issue an API key.")
  }
}
