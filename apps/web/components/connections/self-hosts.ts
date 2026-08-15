/**
 * This deployment's own hosts, as the browser can know them.
 *
 * The control plane refuses a connection whose base URL points back at the
 * gateway or the control plane itself — a connector that could call this
 * deployment would make the gateway a confused deputy against its own API. That
 * list is env-driven server-side (`convex/_shared/upstream_url.ts`), so the
 * dashboard cannot restate it; it passes the two origins it does know, purely
 * so the user gets a specific sentence instead of a generic rejection.
 *
 * Module-level and computed once: this is a stable array identity, which keeps
 * it safe in the dependency list of the save hook.
 */
import { CONVEX_URL, GATEWAY_URL } from "@/lib/env"

function hostOf(origin: string | null): string | null {
  if (origin === null || origin.length === 0) return null
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return null
  }
}

export const DEPLOYMENT_HOSTS: readonly string[] = [CONVEX_URL, GATEWAY_URL]
  .map(hostOf)
  .filter((host): host is string => host !== null)
