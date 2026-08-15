/**
 * Display formatters. Deliberately locale-independent and `now`-injected so
 * the server render and the client hydration produce identical text.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** `2023-11-14 22:13 UTC` — stable everywhere, sortable, unambiguous. */
export function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "unknown"
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`
}

/** `just now` / `4 min ago` / `3 h ago` / `2 d ago` / `in 5 min`. */
export function formatRelativeTime(timestamp: number | undefined, now: number): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return "never"

  const delta = timestamp - now
  const magnitude = Math.abs(delta)
  if (magnitude < MINUTE) return "just now"

  const [value, unit] =
    magnitude < HOUR
      ? [Math.floor(magnitude / MINUTE), "min"]
      : magnitude < DAY
        ? [Math.floor(magnitude / HOUR), "h"]
        : [Math.floor(magnitude / DAY), "d"]

  return delta < 0 ? `${value} ${unit} ago` : `in ${value} ${unit}`
}

/** Countdown copy for a pairing code. */
export function formatExpiry(expiresAt: number, now: number): string {
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return "expired"
  return `expires ${formatRelativeTime(expiresAt, now)}`
}

// A Map, not an object: a bare index would resolve "toString" through the
// prototype chain and echo a function into the DOM.
const PLATFORM_LABELS = new Map<string, string>([
  ["windows", "Windows"],
  ["macos", "macOS"],
  ["linux", "Linux"],
])

/** Platform strings come from a device record; never echo an unknown one back. */
export function formatPlatform(platform: string): string {
  return PLATFORM_LABELS.get(platform) ?? "Unknown platform"
}

export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—"
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`
  return `${(milliseconds / 1000).toFixed(1)} s`
}
