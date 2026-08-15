/**
 * Public env, read through literal `process.env.NEXT_PUBLIC_*` member access so
 * Next can inline the values at build time. Nothing secret belongs here — every
 * value in this file ships to the browser.
 */
import { normalizeGatewayUrl } from "./gateway-config"

/** Validated public gateway origin, or null when it is unset/misconfigured. */
export const GATEWAY_URL: string | null = normalizeGatewayUrl(process.env.NEXT_PUBLIC_GATEWAY_URL)

/** Convex deployment URL. Absent means the app cannot talk to its backend. */
export const CONVEX_URL: string = process.env.NEXT_PUBLIC_CONVEX_URL ?? ""
