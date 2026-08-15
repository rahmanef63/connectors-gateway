/**
 * Open-redirect guard. `?next=` is attacker-controllable: the proxy writes it,
 * but anyone can hand-craft the sign-in URL. Only same-origin absolute paths
 * survive; everything else falls back to the dashboard home.
 */

export const DEFAULT_LANDING = "/devices"
const MAX_LENGTH = 512
const SPACE = 0x20
const DELETE = 0x7f

/** Control characters and whitespace enable header/log splitting. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= SPACE || code === DELETE) return true
  }
  return false
}

/** True only for a path that stays on this origin. */
export function isSafeInternalPath(value: unknown): value is string {
  if (typeof value !== "string") return false
  if (value.length === 0 || value.length > MAX_LENGTH) return false
  if (!value.startsWith("/")) return false
  // `//host` and `/\host` are protocol-relative — they leave the origin.
  if (value.startsWith("//") || value.startsWith("/\\")) return false
  // A scheme anywhere means someone smuggled an absolute URL through.
  if (/[a-z][a-z0-9+.-]*:/i.test(value)) return false
  if (hasControlCharacter(value)) return false
  return true
}

export function safeInternalPath(value: unknown): string {
  return isSafeInternalPath(value) ? value : DEFAULT_LANDING
}

/** Build the sign-in URL the proxy redirects an unauthenticated visitor to. */
export function signInPath(pathname: string, search = ""): string {
  const target = `${pathname}${search}`
  if (!isSafeInternalPath(target) || target === "/") return "/sign-in"
  return `/sign-in?next=${encodeURIComponent(target)}`
}
