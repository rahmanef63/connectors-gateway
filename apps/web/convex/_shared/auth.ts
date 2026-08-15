/**
 * Authorization primitives. Every public Convex function calls one of these as
 * its first statement — a route-layer gate in the Next app does not protect a
 * Convex function, because these endpoints are directly reachable by anyone
 * holding the deployment URL.
 */
import type { Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { getAuthUserId } from "@convex-dev/auth/server"
import { timingSafeEqual } from "./constant-time"
import { fail } from "./errors"

export type AuthCtx = QueryCtx | MutationCtx

/** The signed-in human. Throws when the caller has no session. */
export async function requireUser(ctx: AuthCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx)
  if (userId === null) {
    fail("NOT_AUTHORIZED", "Sign in to continue.")
  }
  return userId
}

/**
 * Admin is an env allowlist on the deployment (`ADMIN_EMAILS`), not a row a
 * user can write. Unset or empty means nobody is an admin — fail closed.
 */
export async function requireAdmin(ctx: AuthCtx): Promise<Id<"users">> {
  const userId = await requireUser(ctx)
  const user = await ctx.db.get(userId)
  const email = user?.email
  if (typeof email !== "string" || !adminEmails().has(email.trim().toLowerCase())) {
    fail("NOT_AUTHORIZED", "Administrator access is required.")
  }
  return userId
}

/**
 * The gateway process presents a shared service token. It is compared in
 * constant time, and an unset `GATEWAY_SERVICE_TOKEN` rejects every caller —
 * a missing env var must never turn the service surface into a public one.
 */
export function requireService(_ctx: AuthCtx, token: string): void {
  const expected = process.env.GATEWAY_SERVICE_TOKEN
  if (typeof expected !== "string" || expected.length === 0) {
    fail("NOT_AUTHORIZED", "Service authentication is not configured.")
  }
  if (!timingSafeEqual(token, expected)) {
    fail("NOT_AUTHORIZED", "Service authentication failed.")
  }
}

function adminEmails(): ReadonlySet<string> {
  const raw = process.env.ADMIN_EMAILS
  if (typeof raw !== "string") return new Set()
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  )
}
