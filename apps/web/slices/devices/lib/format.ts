/**
 * Timestamp formatting. Locale and time zone are always caller-supplied with a
 * runtime default, so the slice carries no locale assumption of its own.
 */

export type TimestampFormatOptions = {
  locale?: string | undefined
  timeZone?: string | undefined
  fallback?: string
}

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
}

export function formatTimestamp(value: unknown, options: TimestampFormatOptions = {}): string {
  const fallback = options.fallback ?? "—"
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  const formatOptions: Intl.DateTimeFormatOptions =
    options.timeZone === undefined ? DATE_TIME_FORMAT : { ...DATE_TIME_FORMAT, timeZone: options.timeZone }
  return new Intl.DateTimeFormat(options.locale, formatOptions).format(date)
}

/** `never` copy is a label, so the caller passes it in. */
export function formatLastSeen(
  value: unknown,
  never: string,
  options: TimestampFormatOptions = {},
): string {
  return formatTimestamp(value, { ...options, fallback: never })
}
