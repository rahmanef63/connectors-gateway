/**
 * Gateway-facing audit sink — docs/10-observability.md.
 * "service/audit:append".
 *
 * The event validator is the whole allowlist: there is no `payload`,
 * `headers` or `message` field, so a careless caller has nowhere to put a
 * token or a local path even if it tried.
 */
import { v } from "convex/values"
import { mutation } from "../_generated/server"
import { auditEventValidator } from "../_shared/audit-record"
import { requireService } from "../_shared/auth"
import { fail } from "../_shared/errors"

export const append = mutation({
  args: { serviceToken: v.string(), event: auditEventValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    requireService(ctx, args.serviceToken)
    const { event } = args
    if (!Number.isFinite(event.timestamp) || !Number.isFinite(event.latencyMs)) {
      fail("INVALID_INPUT", "Audit timing fields must be finite numbers.")
    }
    if (event.latencyMs < 0) {
      fail("INVALID_INPUT", "Audit latency must not be negative.")
    }
    await ctx.db.insert("auditLogs", event)
    return null
  },
})
