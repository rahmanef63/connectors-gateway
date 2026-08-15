/**
 * Export-path safety.
 *
 * Two independent jobs (docs/14 "malicious connector input accesses local files" and
 * "result contains sensitive local path"):
 *   1. `resolveExportPath` keeps a caller-supplied name inside one explicit export root.
 *   2. `toSafeOutput` guarantees nothing path-shaped ever travels back toward the model.
 */
import { isAbsolute, relative, resolve } from "node:path"
import { GatewayError } from "@cg/core"

const DRIVE_LETTER = /^[A-Za-z]:/
const SEPARATORS = /[\\/]+/
const SPACE_CODE = 0x20
const DELETE_CODE = 0x7f

export const MAX_EXPORT_NAME_LENGTH = 200

/** Null bytes and other control characters are never legitimate in a file name. */
function isControlChar(code: number): boolean {
  return code < SPACE_CODE || code === DELETE_CODE
}

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (isControlChar(value.charCodeAt(index))) return true
  }
  return false
}

function stripControlChars(value: string): string {
  let out = ""
  for (let index = 0; index < value.length; index += 1) {
    if (!isControlChar(value.charCodeAt(index))) out += value.charAt(index)
  }
  return out
}

function invalidPath(): GatewayError {
  // The rejected value is never echoed: it is caller-controlled and may be a local path.
  return new GatewayError("INVALID_INPUT", "The export file name must be a relative name inside the export root.")
}

/**
 * Resolve `requested` under `root`, or throw. Rejects absolute paths (POSIX, Windows drive
 * and UNC), `..` traversal, `~`, null bytes/control characters, and anything that still
 * resolves outside `root`.
 */
export function resolveExportPath(root: string, requested: string): string {
  if (typeof root !== "string" || root.length === 0) throw invalidPath()
  if (typeof requested !== "string" || requested.length === 0) throw invalidPath()
  if (requested.length > MAX_EXPORT_NAME_LENGTH) throw invalidPath()
  if (hasControlChars(requested) || hasControlChars(root)) throw invalidPath()
  if (requested.startsWith("~")) throw invalidPath()
  if (requested.startsWith("/") || requested.startsWith("\\")) throw invalidPath()
  if (DRIVE_LETTER.test(requested)) throw invalidPath()
  if (isAbsolute(requested)) throw invalidPath()

  const segments = requested.split(SEPARATORS)
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") throw invalidPath()
  }

  const base = resolve(root)
  const target = resolve(base, segments.join("/"))
  // Belt and braces: even after the segment scan, prove the result is under the root.
  const rel = relative(base, target)
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw invalidPath()
  return target
}

/**
 * The validated name, relative to the root and POSIX-normalised — this is what actually
 * crosses the wire; the bridge re-resolves it against its own export root.
 */
export function toRelativeExportName(root: string, requested: string): string {
  const base = resolve(root)
  const target = resolveExportPath(base, requested)
  return relative(base, target).split(SEPARATORS).join("/")
}

/**
 * Reduce anything path-shaped to its base name. Handles POSIX and Windows input on either
 * platform on purpose — the string may come from a bridge running on another OS.
 */
export function toSafeOutput(absolutePath: string): string {
  if (typeof absolutePath !== "string") return "output"
  const segments = stripControlChars(absolutePath)
    .split(SEPARATORS)
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
  const last = segments[segments.length - 1] ?? ""
  const name = last.replace(DRIVE_LETTER, "").trim()
  return name === "" ? "output" : name
}

/** True when a string looks like an absolute local path, in either OS flavour. */
export function looksLikePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\\\") || DRIVE_LETTER.test(value)
}
