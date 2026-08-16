/**
 * Filesystem-path scrubbing — docs/14-threat-model.md ("result contains
 * sensitive local path"). An absolute path names the user's machine layout;
 * only the basename is ever useful to an AI client or a log reader.
 */

/**
 * A POSIX absolute path with at least two segments (`/a/b`), anchored on a
 * delimiter so URL paths (`https://host/v1/x`) are left intact.
 */
const POSIX_PATH = /(^|[\s"'`([=:,])(\/(?:[^\s/\\:*?"'`<>|]+\/)+[^\s/\\:*?"'`<>|]*)/g

/** A Windows drive-qualified path (`C:\a\b`). */
const WINDOWS_PATH = /(^|[\s"'`([=,])([A-Za-z]:\\(?:[^\s\\/:*?"'`<>|]+\\)*[^\s\\/:*?"'`<>|]*)/g

/** Last non-empty segment of a POSIX or Windows path. */
export function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) ?? path
}

/** Rewrite every absolute path inside `value` to its basename. */
export function stripPaths(value: string): string {
  return value
    .replace(POSIX_PATH, (_match, lead: string, path: string) => lead + basename(path))
    .replace(WINDOWS_PATH, (_match, lead: string, path: string) => lead + basename(path))
}
