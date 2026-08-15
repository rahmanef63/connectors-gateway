/**
 * Dashboard audit trail. Paginated by the `by_user_time` index and scoped to
 * the caller: `userId` is never an argument, so no page can ever contain
 * another user's row.
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { query } from "../../_generated/server"
import { auditRowValidator, toAuditRow } from "../../_shared/audit-record"
import { requireUser } from "../../_shared/auth"
import { MAX_AUDIT_PAGE_SIZE } from "../../_shared/limits"

export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(auditRowValidator),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    // A caller-supplied page size is still caller-supplied input.
    const numItems = Math.min(Math.max(Math.trunc(args.paginationOpts.numItems), 1), MAX_AUDIT_PAGE_SIZE)
    const result = await ctx.db
      .query("auditLogs")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems })
    return { ...result, page: result.page.map(toAuditRow) }
  },
})
