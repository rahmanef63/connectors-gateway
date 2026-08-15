/**
 * Approval prompt lookup. A pending challenge has no owner yet — the code
 * itself is the capability — so any signed-in user may read one by code. Once
 * a challenge is bound to a user, only that user can see it again.
 */
import { v } from "convex/values"
import { query } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import { assertPairingCode } from "../../_shared/input"
import { challengeByCode } from "../../_shared/lookup"
import {
  pairingPromptValidator,
  toPairingPrompt,
  type PairingPrompt,
} from "../../_shared/pairing_record"

export const getByCode = query({
  args: { code: v.string() },
  returns: v.union(pairingPromptValidator, v.null()),
  handler: async (ctx, args): Promise<PairingPrompt | null> => {
    const userId = await requireUser(ctx)
    const challenge = await challengeByCode(ctx, assertPairingCode(args.code))
    if (challenge === null) return null
    if (challenge.userId !== undefined && challenge.userId !== userId) return null
    return toPairingPrompt(challenge, Date.now())
  },
})
