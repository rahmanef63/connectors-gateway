/**
 * Display helpers for the API-key table. Pure, so the whole "what does a key
 * look like on screen" question is answered in one tested place.
 *
 * Nothing here ever receives the secret half of a key: the table is rendered
 * from `ApiKeyView`, which has no field that could hold one.
 */
import type { Tone } from "@/components/status-badge"
import { formatTimestamp } from "@/lib/format"
import type { ApiKeyView } from "./read"

/** Head/tail kept, middle elided — an id stays recognisable at both ends. */
const HEAD = 10
const TAIL = 4

/** A value shorter than head + tail + the ellipsis is returned unchanged. */
export function truncateMiddle(value: string, head = HEAD, tail = TAIL): string {
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}

/**
 * The public head of a key, as it appears in a client's config file:
 * `cgk_key_ab12cd…7f9_…`. It is what lets someone match a row to the key
 * already pasted into Claude Desktop — and it stops at the secret, which this
 * app has not held since the moment it was minted.
 */
export function keyReference(keyId: string): string {
  return `cgk_${truncateMiddle(keyId)}_…`
}

/** Status → tone. Keyed by the control plane's `apiKeyStatusValidator` union. */
export const API_KEY_STATUS_TONES: Readonly<Record<string, Tone>> = Object.freeze({
  active: "success",
  expired: "warning",
  revoked: "danger",
})

/** Only an `active` key can be revoked; the rest are already terminal. */
export function isRevocable(view: ApiKeyView): boolean {
  return view.status === "active"
}

/**
 * Absolute UTC for both timestamps — a key's age is audit information, and an
 * absolute string renders identically on the server and after hydration, which
 * a "4 min ago" computed from two different clocks does not.
 */
export function formatCreated(createdAt: number | undefined): string {
  return createdAt === undefined ? "unknown" : formatTimestamp(createdAt)
}

/** `never` is the honest answer for a key no client has authenticated with. */
export function formatLastUsed(lastUsedAt: number | undefined): string {
  return lastUsedAt === undefined ? "never" : formatTimestamp(lastUsedAt)
}
