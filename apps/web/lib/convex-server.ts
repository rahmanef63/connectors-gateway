/**
 * Server-side Convex call options. Every authed page preloads with the caller's
 * session token so Convex re-checks identity itself — the page never asserts
 * who the user is (P0: authorize server-side, never trust the caller's claim).
 */
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server"

export async function convexOptions(): Promise<{ token: string | undefined }> {
  return { token: await convexAuthNextjsToken() }
}
