/**
 * Browser side of pairing: the signed-in user approves a code, which binds
 * the challenge to their identity. The agent then claims it exactly once
 * through `service/pairing:claim`.
 */
import { v } from "convex/values"
import { mutation } from "../../_generated/server"
import { requireUser } from "../../_shared/auth"
import { fail } from "../../_shared/errors"
import { assertPairingCode } from "../../_shared/input"
import { challengeByCode } from "../../_shared/lookup"

export const approve = mutation({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await requireUser(ctx)
    const challenge = await challengeByCode(ctx, assertPairingCode(args.code))
    if (challenge === null) fail("INVALID_INPUT", "Pairing code is not valid.")
    // Someone else's approved/claimed challenge must not be re-bound.
    if (challenge.userId !== undefined && challenge.userId !== userId) {
      fail("NOT_AUTHORIZED", "Pairing code is not valid.")
    }
    if (challenge.expiresAt <= Date.now()) {
      await ctx.db.patch(challenge._id, { status: "expired" })
      fail("INVALID_INPUT", "Pairing code has expired.")
    }
    if (challenge.status !== "pending") {
      fail("INVALID_INPUT", "Pairing code is no longer awaiting approval.")
    }
    await ctx.db.patch(challenge._id, { status: "approved", userId })
    return null
  },
})
